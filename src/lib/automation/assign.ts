import type { AutoAssignmentRule } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isAssignableRole } from "@/lib/tickets/access";
import { logTicketEvent } from "@/lib/tickets/audit";

const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "REOPENED"] as const;

type Target = { userId: string; userName: string; teamId: string | null };

async function staffPool(teamId: string | null) {
  return db.user.findMany({
    where: {
      isActive: true,
      role: { in: ["ADMIN", "MANAGER", "AGENT"] },
      ...(teamId ? { teamId } : {}),
    },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
}

async function fewestOpenTickets(pool: Array<{ id: string }>): Promise<string> {
  const loads = await db.ticket.groupBy({
    by: ["assigneeId"],
    where: {
      assigneeId: { in: pool.map((member) => member.id) },
      status: { in: [...ACTIVE_STATUSES] },
    },
    _count: { _all: true },
  });
  const loadById = new Map(loads.map((row) => [row.assigneeId, row._count._all]));
  const ranked = [...pool].sort(
    (a, b) => (loadById.get(a.id) ?? 0) - (loadById.get(b.id) ?? 0) || (a.id < b.id ? -1 : 1),
  );
  return ranked[0]!.id;
}

async function resolveTarget(
  rule: AutoAssignmentRule,
  ticketTeamId: string | null,
): Promise<Target | null> {
  // Explicit person always wins, with a liveness check.
  if (rule.targetUserId) {
    const user = await db.user.findFirst({
      where: { id: rule.targetUserId, isActive: true },
    });
    if (!user || !isAssignableRole(user.role)) return null;
    return {
      userId: user.id,
      userName: user.name,
      teamId: rule.targetTeamId ?? ticketTeamId ?? user.teamId,
    };
  }

  const teamId = rule.targetTeamId ?? ticketTeamId ?? rule.teamId;
  const pool = await staffPool(teamId);
  if (pool.length === 0) return null;

  // CATEGORY rules with a team target but no person balance across that team.
  if (rule.strategy === "WORKLOAD" || rule.strategy === "CATEGORY") {
    const userId = await fewestOpenTickets(pool);
    const member = pool.find((entry) => entry.id === userId)!;
    return { userId: member.id, userName: member.name, teamId };
  }

  if (rule.strategy === "ROUND_ROBIN") {
    const state = (rule.state as { lastUserId?: string } | null) ?? null;
    const index = pool.findIndex((member) => member.id === state?.lastUserId);
    const next = pool[(index + 1) % pool.length]!;
    return { userId: next.id, userName: next.name, teamId };
  }

  return null;
}

export async function runAutoAssign(
  ticketId: string,
): Promise<{ assigned: boolean; reason: string }> {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, categoryId: true, teamId: true, assigneeId: true },
  });
  if (!ticket) return { assigned: false, reason: "ticket-not-found" };
  if (ticket.assigneeId) return { assigned: false, reason: "already-assigned" };
  if (ticket.status === "CLOSED" || ticket.status === "RESOLVED") {
    return { assigned: false, reason: "ticket-closed" };
  }

  const rules = await db.autoAssignmentRule.findMany({
    where: { isActive: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  for (const rule of rules) {
    if (rule.categoryId && rule.categoryId !== ticket.categoryId) continue;
    if (rule.teamId && rule.teamId !== ticket.teamId) continue;

    const target = await resolveTarget(rule, ticket.teamId);
    if (!target) continue;

    await db.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { assigneeId: target.userId, teamId: target.teamId ?? ticket.teamId },
      });
      await logTicketEvent(tx, {
        ticketId: ticket.id,
        actorId: null,
        type: "ASSIGNED",
        field: "assignee",
        oldValue: "Unassigned",
        newValue: target.userName,
        metadata: { rule: rule.name, strategy: rule.strategy },
      });
      if (rule.strategy === "ROUND_ROBIN") {
        await tx.autoAssignmentRule.update({
          where: { id: rule.id },
          data: { state: { lastUserId: target.userId } },
        });
      }
    });
    return { assigned: true, reason: rule.name };
  }

  return { assigned: false, reason: "no-matching-rule" };
}
