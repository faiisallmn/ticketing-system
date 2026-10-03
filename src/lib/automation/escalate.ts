import type { EscalationRule, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { logTicketEvent } from "@/lib/tickets/audit";
import { computeDueDatesFor } from "@/lib/sla/service";
import { emitWebhookEvent, managerIds, notifyUsers, ticketPayload } from "@/lib/notifications/service";
import { ticketEscalatedMail } from "@/lib/email/templates";

const PRIORITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

type Candidate = {
  id: string;
  status: string;
  priority: string;
  categoryId: string | null;
  teamId: string | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  dueResponseAt: Date | null;
  dueResolutionAt: Date | null;
  waitingSinceAt: Date | null;
};

type ScopeLike = {
  categoryId: string | null;
  teamId: string | null;
  priority: string | null;
};

function scopeMatches(rule: ScopeLike, ticket: Candidate): boolean {
  if (rule.categoryId && rule.categoryId !== ticket.categoryId) return false;
  if (rule.teamId && rule.teamId !== ticket.teamId) return false;
  if (rule.priority && rule.priority !== ticket.priority) return false;
  return true;
}

function triggerHolds(
  rule: Pick<EscalationRule, "trigger" | "thresholdMinutes">,
  ticket: Candidate,
  now: Date,
): boolean {
  const thresholdMs = rule.thresholdMinutes * 60000;

  if (rule.trigger === "WAITING_TOO_LONG") {
    return (
      ticket.status === "WAITING_ON_CUSTOMER" &&
      ticket.waitingSinceAt !== null &&
      ticket.waitingSinceAt.getTime() <= now.getTime() - thresholdMs
    );
  }

  const responseOverdue =
    ticket.dueResponseAt !== null &&
    ticket.firstRespondedAt === null &&
    ticket.dueResponseAt.getTime() <= now.getTime();
  const resolutionOverdue =
    ticket.dueResolutionAt !== null &&
    ticket.resolvedAt === null &&
    ticket.dueResolutionAt.getTime() <= now.getTime();

  if (rule.trigger === "SLA_BREACH") {
    return responseOverdue || resolutionOverdue;
  }

  // SLA_BREACH_IMMINENT: deadline in the future but within the warning window.
  const responseDueSoon =
    ticket.dueResponseAt !== null &&
    ticket.firstRespondedAt === null &&
    ticket.dueResponseAt.getTime() > now.getTime() &&
    ticket.dueResponseAt.getTime() <= now.getTime() + thresholdMs;
  const resolutionDueSoon =
    ticket.dueResolutionAt !== null &&
    ticket.resolvedAt === null &&
    ticket.dueResolutionAt.getTime() > now.getTime() &&
    ticket.dueResolutionAt.getTime() <= now.getTime() + thresholdMs;
  return responseDueSoon || resolutionDueSoon;
}

async function coolingDown(rule: EscalationRule, ticketId: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - rule.cooldownMinutes * 60000);
  const recent = await db.ticketEvent.findMany({
    where: { ticketId, type: "ESCALATED", createdAt: { gte: cutoff } },
    select: { metadata: true },
  });
  return recent.some(
    (event) => (event.metadata as { ruleId?: string } | null)?.ruleId === rule.id,
  );
}

export type FireResult =
  | { fired: false; reason: string }
  | { fired: true; reassignToTeam: boolean };

export async function fireEscalation(
  rule: EscalationRule,
  ticketId: string,
  now: Date = new Date(),
): Promise<FireResult> {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { fired: false, reason: "ticket-not-found" };

  // Resolve targets before touching the database so misconfigured rules and
  // no-ops report honestly instead of firing empty escalations.
  let raiseTo: (typeof PRIORITY_ORDER)[number] | null = null;
  if (rule.action === "RAISE_PRIORITY") {
    const bumped =
      PRIORITY_ORDER.indexOf(ticket.priority as (typeof PRIORITY_ORDER)[number]) + 1;
    const next = rule.newPriority ?? PRIORITY_ORDER[bumped];
    if (!next || next === ticket.priority) {
      return { fired: false, reason: "already-at-target-priority" };
    }
    raiseTo = next;
  }

  let reassignTarget: { id: string; name: string } | null = null;
  if (rule.action === "REASSIGN_TEAM") {
    if (!rule.targetTeamId) return { fired: false, reason: "rule-missing-target-team" };
    const target = await db.team.findUnique({
      where: { id: rule.targetTeamId },
      select: { id: true, name: true },
    });
    if (!target) return { fired: false, reason: "target-team-missing" };
    reassignTarget = target;
  }

  let reassignToTeam = false;
  let detail = "";

  await db.$transaction(async (tx) => {
    const metadata: Record<string, Prisma.InputJsonValue | undefined> = {
      ruleId: rule.id,
      rule: rule.name,
      action: rule.action,
    };

    if (rule.action === "RAISE_PRIORITY" && raiseTo) {
      const dues = await computeDueDatesFor(ticket.categoryId, raiseTo, now);
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          priority: raiseTo,
          escalationLevel: { increment: 1 },
          lastEscalatedAt: now,
          ...(dues ?? {}),
        },
      });
      metadata.from = ticket.priority;
      metadata.to = raiseTo;
      detail = `Priority raised from ${ticket.priority} to ${raiseTo} by rule "${rule.name}"`;
    } else if (rule.action === "REASSIGN_TEAM" && reassignTarget) {
      const previous = ticket.teamId
        ? await tx.team.findUnique({ where: { id: ticket.teamId }, select: { name: true } })
        : null;
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          teamId: reassignTarget.id,
          assigneeId: null,
          escalationLevel: { increment: 1 },
          lastEscalatedAt: now,
        },
      });
      metadata.fromTeam = previous?.name ?? "No team";
      metadata.toTeam = reassignTarget.name;
      reassignToTeam = true;
      detail = `Moved from ${previous?.name ?? "no team"} to ${reassignTarget.name} by rule "${rule.name}"`;
    } else {
      // NOTIFY_MANAGER: no ticket mutation; the event is the record.
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { escalationLevel: { increment: 1 }, lastEscalatedAt: now },
      });
      detail = `Manager attention requested by rule "${rule.name}"`;
    }

    await logTicketEvent(tx, {
      ticketId: ticket.id,
      actorId: null,
      type: "ESCALATED",
      metadata: metadata as Prisma.InputJsonValue,
    });
  });

  try {
    const after = await db.ticket.findUnique({
      where: { id: ticket.id },
      select: { publicId: true, title: true, assigneeId: true, departmentId: true },
    });
    if (after) {
      const managers = await managerIds(ticket.departmentId);
      const recipients =
        rule.action === "RAISE_PRIORITY" && after.assigneeId
          ? [after.assigneeId, ...managers]
          : rule.action === "REASSIGN_TEAM" && ticket.assigneeId
            ? [ticket.assigneeId, ...managers]
            : managers;
      await notifyUsers({
        userIds: recipients,
        ticketId: ticket.id,
        type: "ESCALATED",
        title: `Escalated: ${after.publicId}`,
        body: detail,
        email: { template: "ticket-escalated", ...ticketEscalatedMail(after, detail, null) },
      });
      await emitWebhookEvent("ESCALATED", ticket.id, ticketPayload(after, detail));
    }
  } catch (error) {
    console.error(`[escalation] notify failed for ticket ${ticketId}`, error);
  }

  return { fired: true, reassignToTeam };
}

export async function evaluateEscalations(
  now: Date = new Date(),
): Promise<{ evaluated: number; fired: number }> {
  const rules = await db.escalationRule.findMany({
    where: { isActive: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  if (rules.length === 0) return { evaluated: 0, fired: 0 };

  const tickets = await db.ticket.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "REOPENED"] } },
    select: {
      id: true,
      status: true,
      priority: true,
      categoryId: true,
      teamId: true,
      firstRespondedAt: true,
      resolvedAt: true,
      dueResponseAt: true,
      dueResolutionAt: true,
      waitingSinceAt: true,
    },
  });

  let fired = 0;
  for (const ticket of tickets) {
    for (const rule of rules) {
      if (!scopeMatches(rule, ticket)) continue;
      if (!triggerHolds(rule, ticket, now)) continue;
      if (await coolingDown(rule, ticket.id, now)) continue;
      const result = await fireEscalation(rule, ticket.id, now);
      if (!result.fired) continue;
      fired += 1;
      if (result.reassignToTeam) {
        const { enqueueAutoAssign } = await import("@/lib/queue");
        await enqueueAutoAssign(ticket.id).catch(() => undefined);
      }
      break;
    }
  }

  return { evaluated: tickets.length, fired };
}
