import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { emailFrom, extractPublicId } from "./client";
import { commentAddedMail, ticketReceivedMail } from "./templates";
import { logTicketEvent } from "@/lib/tickets/audit";
import { computeDueDatesFor } from "@/lib/sla/service";
import { emitWebhookEvent, notifyUsers, ticketPayload } from "@/lib/notifications/service";
import { enqueueAutoAssign } from "@/lib/queue";
import {
  isAllowedMimeType,
  maxUploadBytes,
  storeAttachmentFiles,
  type IncomingFile,
} from "@/lib/attachments";

export type InboundEmail = {
  /** Provider-side id, used for idempotency. */
  emailId: string;
  messageId?: string | null;
  /** Bare lowercase address. */
  from: string;
  fromName?: string | null;
  to: string[];
  subject?: string | null;
  textBody?: string | null;
  htmlBody?: string | null;
  headers?: Record<string, string> | null;
  attachments: IncomingFile[];
};

export type InboundResult =
  | { action: "ignored"; reason: string }
  | { action: "duplicate" }
  | { action: "created"; ticketId: string; publicId: string }
  | { action: "comment"; ticketId: string; publicId: string; commentId: string };

const AUTO_REPLY_SUBJECT = /^(auto:?|automatic reply|out of office|ooo:?|postmaster|mailer-daemon)/i;

export function parseAddress(value: string): { name: string | null; email: string } {
  const trimmed = value.trim();
  const match = /^(?:"?([^"<]*)"?\s*)?<([^<>\s]+@[^<>\s]+)>$/.exec(trimmed);
  if (match) {
    return { name: match[1]?.trim() || null, email: match[2]!.trim().toLowerCase() };
  }
  return { name: null, email: trimmed.toLowerCase() };
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function htmlToText(html: string): string {
  return html
    .replace(/<(br|p|div|li|tr|h\d)[^>]*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d|table|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Drop quoted history ("> …", "On … wrote:", forwarded blocks) from replies. */
export function stripQuotedReply(text: string): string {
  const lines = text.split("\n");
  let cutAt = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (/^on .+ wrote:$/i.test(line) || /forwarded message/i.test(line) || /^-{3,}\s*$/.test(line)) {
      cutAt = index;
      break;
    }
  }
  const kept = lines
    .slice(0, cutAt)
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return kept.length >= 20 ? kept : text.trim();
}

async function resolveSender(email: string, name: string | null) {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;

  // First contact over email provisions a requester account. The address is
  // not public, and every mail is attributable, so this is safe for an
  // internal desk. The account cannot sign in (random password, must reset).
  const localPart = email.split("@")[0] ?? "requester";
  return db.user.create({
    data: {
      name: name || localPart,
      email,
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
      role: "REQUESTER",
      isActive: true,
    },
  });
}

async function storeInboundAttachments(
  ticketId: string,
  uploaderId: string,
  commentId: string | null,
  files: IncomingFile[],
): Promise<{ stored: number; skipped: string[] }> {
  const limit = maxUploadBytes();
  const accepted: IncomingFile[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (!file.filename || file.size > limit || !isAllowedMimeType(file.mimeType)) {
      skipped.push(file.filename || "unnamed file");
      continue;
    }
    accepted.push(file);
  }
  if (accepted.length === 0) return { stored: 0, skipped };

  const stored = await storeAttachmentFiles(ticketId, accepted);
  await db.$transaction(async (tx) => {
    await Promise.all(
      stored.map((file) =>
        tx.attachment.create({
          data: {
            ticketId,
            commentId,
            uploaderId,
            filename: file.filename,
            storagePath: file.storagePath,
            mimeType: file.mimeType,
            size: file.size,
          },
        }),
      ),
    );
    await logTicketEvent(tx, {
      ticketId,
      actorId: uploaderId,
      type: "ATTACHMENT_ADDED",
      metadata: {
        count: stored.length,
        filenames: stored.map((file) => file.filename),
        source: "EMAIL",
      },
    });
  });
  return { stored: stored.length, skipped };
}

export async function processInboundEmail(mail: InboundEmail): Promise<InboundResult> {
  if (!validEmail(mail.from)) return { action: "ignored", reason: "invalid-sender" };

  // Loop protection: never ingest our own notifications back.
  const ownAddress = emailFrom().match(/<([^>]+)>/)?.[1]?.toLowerCase();
  if (ownAddress && mail.from === ownAddress) {
    return { action: "ignored", reason: "self-mail" };
  }
  if (mail.subject && AUTO_REPLY_SUBJECT.test(mail.subject.trim())) {
    return { action: "ignored", reason: "auto-reply" };
  }
  const autoSubmitted = mail.headers?.["auto-submitted"] ?? mail.headers?.["Auto-Submitted"];
  if (autoSubmitted && autoSubmitted.toLowerCase().startsWith("auto-")) {
    return { action: "ignored", reason: "auto-submitted" };
  }

  // Idempotency for redelivered webhooks.
  const priorTicket = await db.ticket.findUnique({
    where: { emailThreadId: mail.emailId },
    select: { id: true, publicId: true },
  });
  if (priorTicket) return { action: "duplicate" };
  const priorComment = await db.comment.findUnique({
    where: { externalId: mail.emailId },
    select: { id: true },
  });
  if (priorComment) return { action: "duplicate" };

  const rawBody = mail.textBody?.trim() || (mail.htmlBody ? htmlToText(mail.htmlBody) : "");
  const body = rawBody ? stripQuotedReply(rawBody) : "";

  let publicId: string | null = null;
  for (const recipient of mail.to) {
    publicId = extractPublicIdFromAddress(recipient);
    if (publicId) break;
  }
  if (!publicId && mail.subject) {
    publicId = extractPublicId(mail.subject);
  }

  const ticket = publicId ? await db.ticket.findUnique({ where: { publicId } }) : null;
  if (ticket && !body && mail.attachments.length === 0) {
    return { action: "ignored", reason: "empty-reply" };
  }

  // Only provision the sender when the mail will actually create something.
  const sender = await resolveSender(mail.from, mail.fromName ?? null);

  if (ticket) return appendInboundReply(ticket.id, ticket, sender.id, mail, body);
  return createInboundTicket(sender.id, mail, body);
}

function extractPublicIdFromAddress(address: string): string | null {
  const match = /ticket\+(TK-\d{1,10})@/i.exec(address);
  return match ? match[1]!.toUpperCase() : null;
}

async function appendInboundReply(
  ticketId: string,
  ticket: {
    publicId: string;
    title: string;
    status: string;
    priority: string;
    requesterId: string;
    assigneeId: string | null;
  },
  senderId: string,
  mail: InboundEmail,
  body: string,
): Promise<InboundResult> {
  const text = body || "(attachment only — see files below)";

  const now = new Date();
  const reopening = ticket.status === "CLOSED";
  const reopenDues = reopening
    ? await computeDueDatesFor(null, ticket.priority, now)
    : null;

  const comment = await db.$transaction(async (tx) => {
    if (reopening) {
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          status: "REOPENED",
          resolvedAt: null,
          closedAt: null,
          reopenedAt: now,
          waitingSinceAt: null,
          ...(reopenDues ? { dueResolutionAt: reopenDues.dueResolutionAt } : {}),
        },
      });
      await logTicketEvent(tx, {
        ticketId,
        actorId: senderId,
        type: "STATUS_CHANGED",
        field: "status",
        oldValue: "CLOSED",
        newValue: "REOPENED",
        metadata: { source: "EMAIL" },
      });
    }
    const created = await tx.comment.create({
      data: {
        ticketId,
        authorId: senderId,
        body: text,
        isInternal: false,
        externalId: mail.emailId,
      },
    });
    await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: now } });
    await logTicketEvent(tx, {
      ticketId,
      actorId: senderId,
      type: "COMMENT_ADDED",
      metadata: { isInternal: false, source: "EMAIL" },
    });
    return created;
  });

  const { skipped } = await storeInboundAttachments(ticketId, senderId, comment.id, mail.attachments);
  if (skipped.length > 0) {
    console.warn(`[inbound] skipped attachments on ${ticket.publicId}: ${skipped.join(", ")}`);
  }

  try {
    const recipients = [ticket.requesterId, ticket.assigneeId].filter(
      (id): id is string => !!id && id !== senderId,
    );
    if (recipients.length > 0) {
      await notifyUsers({
        userIds: recipients,
        ticketId,
        type: "COMMENT_ADDED",
        title: `New reply on ${ticket.publicId}`,
        body: ticket.title,
        email: {
          template: "comment-added",
          ...commentAddedMail(ticket, mail.from, text),
        },
      });
    }
    await emitWebhookEvent(
      "COMMENT_ADDED",
      ticketId,
      ticketPayload(ticket, `Email reply from ${mail.from}`),
    );
  } catch (error) {
    console.error(`[inbound] notify failed for ${ticket.publicId}`, error);
  }

  return { action: "comment", ticketId, publicId: ticket.publicId, commentId: comment.id };
}

async function createInboundTicket(
  senderId: string,
  mail: InboundEmail,
  body: string,
): Promise<InboundResult> {
  const now = new Date();
  const title = (mail.subject?.trim() || "(no subject)").slice(0, 200);
  const description = body || "(no readable content)";
  const dues = await computeDueDatesFor(null, "MEDIUM", now);

  const ticket = await db.$transaction(async (tx) => {
    const [{ n }] =
      await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('ticket_public_id_seq') AS n`;
    const created = await tx.ticket.create({
      data: {
        publicId: `TK-${n.toString().padStart(6, "0")}`,
        title,
        description,
        status: "OPEN",
        priority: "MEDIUM",
        severity: "MEDIUM",
        source: "EMAIL",
        emailThreadId: mail.emailId,
        requesterId: senderId,
        ...(dues ?? {}),
      },
    });
    await logTicketEvent(tx, {
      ticketId: created.id,
      actorId: senderId,
      type: "CREATED",
      metadata: { source: "EMAIL", emailId: mail.emailId },
    });
    return created;
  });

  const { skipped } = await storeInboundAttachments(ticket.id, senderId, null, mail.attachments);
  if (skipped.length > 0) {
    console.warn(`[inbound] skipped attachments on ${ticket.publicId}: ${skipped.join(", ")}`);
  }

  try {
    await enqueueAutoAssign(ticket.id);
  } catch (error) {
    console.error(`[inbound] auto-assign enqueue failed for ${ticket.publicId}`, error);
  }

  try {
    await notifyUsers({
      userIds: [senderId],
      ticketId: ticket.id,
      type: "TICKET_CREATED",
      title: `Ticket ${ticket.publicId} received`,
      body: ticket.title,
      email: {
        template: "ticket-received",
        ...ticketReceivedMail(ticket, mail.fromName ?? mail.from),
      },
    });
    await emitWebhookEvent(
      "TICKET_CREATED",
      ticket.id,
      ticketPayload(ticket, "Created from email"),
    );
  } catch (error) {
    console.error(`[inbound] notify failed for ${ticket.publicId}`, error);
  }

  return { action: "created", ticketId: ticket.id, publicId: ticket.publicId };
}
