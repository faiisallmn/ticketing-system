import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { NotificationType, WebhookEventType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { enqueueEmail, enqueueWebhookDelivery } from "@/lib/queue";
import { appUrl } from "@/lib/email/client";
import type { MailTemplate } from "@/lib/email/templates";

export type NotifyInput = {
  userIds: string[];
  ticketId?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
  email?: { template: string } & MailTemplate;
  /** Pass a transaction client to make rows atomic with surrounding writes. */
  client?: Prisma.TransactionClient | PrismaClient;
};

/**
 * Creates in-app notifications and enqueues one email job per recipient.
 * Never throws for queue outages — callers wrap it so ticket operations
 * always succeed even when Redis is down.
 */
export async function notifyUsers(input: NotifyInput): Promise<void> {
  const uniqueIds = [...new Set(input.userIds)];
  if (uniqueIds.length === 0) return;

  const client = input.client ?? db;
  const users = await client.user.findMany({
    where: { id: { in: uniqueIds }, isActive: true },
    select: { id: true, email: true },
  });
  if (users.length === 0) return;

  await client.notification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      ticketId: input.ticketId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    })),
  });

  if (input.email) {
    for (const user of users) {
      const row = await client.outboundEmail.create({
        data: {
          to: user.email,
          subject: input.email.subject,
          template: input.email.template,
          html: input.email.html,
          ticketId: input.ticketId ?? null,
        },
      });
      await enqueueEmail(row.id);
    }
  }
}

/** Managers/admins for a department, falling back to all managers/admins. */
export async function managerIds(departmentId?: string | null): Promise<string[]> {
  if (departmentId) {
    const scoped = await db.user.findMany({
      where: { role: { in: ["MANAGER", "ADMIN"] }, isActive: true, departmentId },
      select: { id: true },
    });
    if (scoped.length > 0) return scoped.map((user) => user.id);
  }
  const all = await db.user.findMany({
    where: { role: { in: ["MANAGER", "ADMIN"] }, isActive: true },
    select: { id: true },
  });
  return all.map((user) => user.id);
}

/** Standard fields every ticket webhook payload carries. */
export function ticketPayload(
  ticket: { publicId: string; title: string },
  detail?: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ticketPublicId: ticket.publicId,
    title: ticket.title,
    detail: detail ?? null,
    url: `${appUrl()}/tickets/${ticket.publicId}`,
    ...extra,
  };
}

export async function emitWebhookEvent(
  event: WebhookEventType,
  ticketId: string | null,
  data: Record<string, unknown>,
): Promise<void> {
  const webhooks = await db.webhook.findMany({
    where: { isActive: true, events: { has: event } },
  });
  for (const hook of webhooks) {
    const delivery = await db.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        event,
        payload: { event, ticketId, at: new Date().toISOString(), ...data },
      },
    });
    await enqueueWebhookDelivery(delivery.id);
  }
}
