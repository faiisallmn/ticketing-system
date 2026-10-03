import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { emailFrom, inboundReplyAddress, resendClient } from "@/lib/email/client";
import { slaBreachedMail, slaWarningMail } from "@/lib/email/templates";
import {
  emitWebhookEvent,
  managerIds,
  notifyUsers,
  ticketPayload,
} from "@/lib/notifications/service";
import { logTicketEvent } from "@/lib/tickets/audit";
import { runAutoAssign } from "@/lib/automation/assign";
import { evaluateEscalations } from "@/lib/automation/escalate";

const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "REOPENED"] as const;

/** Fixed look-ahead window for "deadline approaching" warnings. */
const WARN_WINDOW_MS = 60 * 60000;

type BreachCandidate = {
  id: string;
  publicId: string;
  title: string;
  assigneeId: string | null;
  departmentId: string | null;
};

async function notifyBreach(
  ticket: BreachCandidate,
  kind: "response" | "resolution",
  deadline: Date,
): Promise<void> {
  try {
    const recipients = ticket.assigneeId
      ? [ticket.assigneeId]
      : await managerIds(ticket.departmentId);
    const label = kind === "response" ? "First response deadline missed" : "Resolution deadline missed";
    await notifyUsers({
      userIds: recipients,
      ticketId: ticket.id,
      type: "SLA_BREACHED",
      title: `SLA breached: ${ticket.publicId}`,
      body: ticket.title,
      metadata: { kind, deadline: deadline.toISOString() },
      email: {
        template: "sla-breached",
        ...slaBreachedMail(ticket, kind === "response" ? "first response" : "resolution"),
      },
    });
    await emitWebhookEvent(
      "SLA_BREACHED",
      ticket.id,
      ticketPayload(ticket, label, { kind, deadline: deadline.toISOString() }),
    );
  } catch (error) {
    console.error(`[sla] breach notify failed for ${ticket.publicId}`, error);
  }
}

async function maybeWarn(
  ticket: BreachCandidate,
  kind: "response" | "resolution",
  due: Date,
  now: Date,
): Promise<void> {
  if (due.getTime() <= now.getTime() || due.getTime() > now.getTime() + WARN_WINDOW_MS) return;

  const iso = due.toISOString();
  const recent = await db.notification.findMany({
    where: { ticketId: ticket.id, type: "SLA_WARNING" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { metadata: true },
  });
  if (
    recent.some(
      (row) =>
        (row.metadata as { deadline?: string; kind?: string } | null)?.deadline === iso,
    )
  ) {
    return;
  }

  try {
    const recipients = ticket.assigneeId
      ? [ticket.assigneeId]
      : await managerIds(ticket.departmentId);
    await notifyUsers({
      userIds: recipients,
      ticketId: ticket.id,
      type: "SLA_WARNING",
      title: `Deadline approaching: ${ticket.publicId}`,
      body: ticket.title,
      metadata: { deadline: iso, kind },
      email: {
        template: "sla-warning",
        ...slaWarningMail(ticket, kind === "response" ? "first response" : "resolution"),
      },
    });
  } catch (error) {
    console.error(`[sla] warning notify failed for ${ticket.publicId}`, error);
  }
}

export async function processAutoAssign(ticketId: string): Promise<{ assigned: boolean; reason: string }> {
  return runAutoAssign(ticketId);
}

/**
 * Marks freshly breached deadlines (exactly once per deadline, guarded by an
 * atomic claim) and then evaluates escalation rules. Idempotent: re-running
 * changes nothing.
 */
export async function processSlaCheck(
  now: Date = new Date(),
): Promise<{ checked: number; breached: number; escalated: number }> {
  const candidates = await db.ticket.findMany({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      OR: [{ dueResponseAt: { not: null } }, { dueResolutionAt: { not: null } }],
    },
    select: {
      id: true,
      publicId: true,
      title: true,
      assigneeId: true,
      departmentId: true,
      dueResponseAt: true,
      dueResolutionAt: true,
      firstRespondedAt: true,
      resolvedAt: true,
      responseBreachNotifiedAt: true,
      resolutionBreachNotifiedAt: true,
    },
  });

  let breached = 0;

  for (const ticket of candidates) {
    if (
      ticket.dueResponseAt &&
      !ticket.firstRespondedAt &&
      !ticket.responseBreachNotifiedAt &&
      ticket.dueResponseAt <= now
    ) {
      // Atomic claim: only the worker that flips the flag logs the breach.
      const claimed = await db.ticket.updateMany({
        where: { id: ticket.id, responseBreachNotifiedAt: null },
        data: { responseBreachNotifiedAt: now },
      });
      if (claimed.count === 1) {
        await logTicketEvent(db, {
          ticketId: ticket.id,
          actorId: null,
          type: "SLA_BREACHED",
          field: "dueResponseAt",
          metadata: { deadline: ticket.dueResponseAt.toISOString() },
        });
        breached += 1;
        await notifyBreach(ticket, "response", ticket.dueResponseAt);
      }
    } else {
      await maybeWarnFor(ticket, "response", now);
    }

    if (
      ticket.dueResolutionAt &&
      !ticket.resolvedAt &&
      !ticket.resolutionBreachNotifiedAt &&
      ticket.dueResolutionAt <= now
    ) {
      const claimed = await db.ticket.updateMany({
        where: { id: ticket.id, resolutionBreachNotifiedAt: null },
        data: { resolutionBreachNotifiedAt: now },
      });
      if (claimed.count === 1) {
        await logTicketEvent(db, {
          ticketId: ticket.id,
          actorId: null,
          type: "SLA_BREACHED",
          field: "dueResolutionAt",
          metadata: { deadline: ticket.dueResolutionAt.toISOString() },
        });
        breached += 1;
        await notifyBreach(ticket, "resolution", ticket.dueResolutionAt);
      }
    } else {
      await maybeWarnFor(ticket, "resolution", now);
    }
  }

  const { fired } = await evaluateEscalations(now);

  // Retention (best effort): delivery and email logs older than 90 days.
  try {
    const cutoff = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
    await db.webhookDelivery.deleteMany({ where: { createdAt: { lt: cutoff } } });
    await db.outboundEmail.deleteMany({ where: { createdAt: { lt: cutoff } } });
  } catch (error) {
    console.error("[sla] retention prune failed", error);
  }

  return { checked: candidates.length, breached, escalated: fired };
}

type DeadlineCandidate = BreachCandidate & {
  dueResponseAt: Date | null;
  dueResolutionAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
};

async function maybeWarnFor(
  ticket: DeadlineCandidate,
  kind: "response" | "resolution",
  now: Date,
): Promise<void> {
  const due = kind === "response" ? ticket.dueResponseAt : ticket.dueResolutionAt;
  const done = kind === "response" ? ticket.firstRespondedAt : ticket.resolvedAt;
  if (!due || done) return;
  await maybeWarn(ticket, kind, due, now);
}

export async function processSendEmail(
  emailId: string,
): Promise<{ sent?: boolean; skipped?: boolean; providerId?: string | null }> {
  const email = await db.outboundEmail.findUnique({ where: { id: emailId } });
  if (!email || email.status === "SENT" || email.status === "SKIPPED") {
    return { skipped: true };
  }

  const client = resendClient();
  if (!client) {
    await db.outboundEmail.update({
      where: { id: email.id },
      data: { status: "SKIPPED", error: "RESEND_API_KEY is not configured." },
    });
    return { skipped: true };
  }

  let replyTo: string | undefined;
  if (email.ticketId) {
    const ticket = await db.ticket.findUnique({
      where: { id: email.ticketId },
      select: { publicId: true },
    });
    if (ticket) replyTo = inboundReplyAddress(ticket.publicId) ?? undefined;
  }

  const { data, error } = await client.emails.send({
    from: emailFrom(),
    to: [email.to],
    subject: email.subject,
    html: email.html,
    ...(replyTo ? { replyTo } : {}),
  });

  if (error) {
    await db.outboundEmail.update({
      where: { id: email.id },
      data: { status: "FAILED", error: error.message },
    });
    throw new Error(`Resend send failed: ${error.message}`);
  }

  await db.outboundEmail.update({
    where: { id: email.id },
    data: { status: "SENT", providerId: data?.id ?? null, error: null },
  });
  return { sent: true, providerId: data?.id ?? null };
}

function toSlackMessage(payload: Record<string, unknown>): { text: string } {
  const publicId = typeof payload.ticketPublicId === "string" ? payload.ticketPublicId : null;
  const title = typeof payload.title === "string" ? payload.title : "";
  const detail = typeof payload.detail === "string" ? payload.detail : "";
  const url = typeof payload.url === "string" ? payload.url : "";
  const head = publicId ? `*[${publicId}] ${title}*` : `*${String(payload.event)}*`;
  return { text: [head, detail, url].filter(Boolean).join("\n") };
}

export async function processWebhookDelivery(
  deliveryId: string,
): Promise<{ delivered: boolean; status?: number }> {
  const delivery = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });
  if (!delivery || delivery.status === "DELIVERED") return { delivered: false };

  if (!delivery.webhook.isActive) {
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", error: "Webhook is disabled." },
    });
    return { delivered: false };
  }

  const payload = (delivery.payload ?? {}) as Record<string, unknown>;
  const body =
    delivery.webhook.format === "SLACK"
      ? JSON.stringify(toSlackMessage(payload))
      : JSON.stringify(payload);
  const signature = createHmac("sha256", delivery.webhook.secret).update(body).digest("hex");

  await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: { attempts: { increment: 1 } },
  });

  let response: Response;
  try {
    response = await fetch(delivery.webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "SupportDesk-Webhooks/1.0",
        "X-Webhook-Event": delivery.event,
        "X-Webhook-Delivery": delivery.id,
        "X-Webhook-Signature": `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", error: message },
    });
    throw error;
  }

  if (!response.ok) {
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", responseCode: response.status, error: `HTTP ${response.status}` },
    });
    throw new Error(`Webhook delivery failed with HTTP ${response.status}`);
  }

  await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: { status: "DELIVERED", responseCode: response.status, error: null },
  });
  return { delivered: true, status: response.status };
}
