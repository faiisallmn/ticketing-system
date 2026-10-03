import { appUrl } from "./client";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/labels";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphs(value: string): string {
  return esc(value)
    .split(/\n{2,}/)
    .map((chunk) => `<p style="margin:0 0 12px;">${chunk.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function layout(args: { heading: string; intro: string; bodyHtml: string; ticketUrl: string; ticketPublicId: string }): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F3F4F2;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
<div style="background:#FBFBFA;border:1px solid #D9DCD7;border-radius:8px;padding:24px;">
<p style="margin:0 0 4px;font-size:12px;color:#8A938D;font-family:monospace;">${esc(args.ticketPublicId)}</p>
<h1 style="margin:0 0 12px;font-size:18px;color:#1C2320;">${esc(args.heading)}</h1>
<p style="margin:0 0 16px;font-size:14px;color:#1C2320;">${esc(args.intro)}</p>
<div style="font-size:14px;color:#1C2320;">${args.bodyHtml}</div>
<p style="margin:20px 0 0;">
<a href="${args.ticketUrl}" style="display:inline-block;background:#2B4FD8;color:#FBFBFA;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 18px;border-radius:6px;">Open ticket</a>
</p>
</div>
<p style="font-size:12px;color:#8A938D;">Reply to this email to add a comment to the ticket.</p>
</div>
</body>
</html>`;
}

export type TicketMailContext = {
  publicId: string;
  title: string;
};

function ticketUrl(publicId: string): string {
  return `${appUrl()}/tickets/${publicId}`;
}

function subject(publicId: string, title: string, prefix: string): string {
  const trimmed = title.length > 80 ? `${title.slice(0, 77)}...` : title;
  return `[${publicId}] ${prefix}: ${trimmed}`;
}

export type MailTemplate = { subject: string; html: string };

export function ticketReceivedMail(ticket: TicketMailContext, requesterName: string): MailTemplate {
  return {
    subject: subject(ticket.publicId, ticket.title, "Ticket received"),
    html: layout({
      heading: "We received your request",
      intro: `Hi ${requesterName}, your ticket is in the queue and an agent will pick it up shortly.`,
      bodyHtml: paragraphs(ticket.title),
      ticketUrl: ticketUrl(ticket.publicId),
      ticketPublicId: ticket.publicId,
    }),
  };
}

export function ticketAssignedMail(
  ticket: TicketMailContext,
  assigneeName: string,
  actorName: string | null,
): MailTemplate {
  return {
    subject: subject(ticket.publicId, ticket.title, "Assigned to you"),
    html: layout({
      heading: `Assigned to ${assigneeName}`,
      intro: actorName
        ? `${actorName} assigned this ticket to you.`
        : "This ticket was assigned to you by the routing rules.",
      bodyHtml: paragraphs(ticket.title),
      ticketUrl: ticketUrl(ticket.publicId),
      ticketPublicId: ticket.publicId,
    }),
  };
}

export function statusChangedMail(
  ticket: TicketMailContext,
  oldStatus: string,
  newStatus: string,
  actorName: string | null,
): MailTemplate {
  const from = STATUS_LABELS[oldStatus as keyof typeof STATUS_LABELS] ?? oldStatus;
  const to = STATUS_LABELS[newStatus as keyof typeof STATUS_LABELS] ?? newStatus;
  return {
    subject: subject(ticket.publicId, ticket.title, to),
    html: layout({
      heading: `Status: ${from} → ${to}`,
      intro: actorName ? `${actorName} updated this ticket.` : "This ticket was updated.",
      bodyHtml: paragraphs(ticket.title),
      ticketUrl: ticketUrl(ticket.publicId),
      ticketPublicId: ticket.publicId,
    }),
  };
}

export function commentAddedMail(
  ticket: TicketMailContext,
  authorName: string,
  commentBody: string,
): MailTemplate {
  const excerpt = commentBody.length > 600 ? `${commentBody.slice(0, 597)}...` : commentBody;
  return {
    subject: subject(ticket.publicId, ticket.title, "New reply"),
    html: layout({
      heading: `${authorName} replied`,
      intro: "A new reply was posted on this ticket.",
      bodyHtml: paragraphs(excerpt),
      ticketUrl: ticketUrl(ticket.publicId),
      ticketPublicId: ticket.publicId,
    }),
  };
}

export function slaWarningMail(ticket: TicketMailContext, deadlineLabel: string): MailTemplate {
  return {
    subject: subject(ticket.publicId, ticket.title, "Deadline approaching"),
    html: layout({
      heading: `Deadline approaching (${deadlineLabel})`,
      intro: "This ticket's SLA deadline is coming up. Please respond or resolve it in time.",
      bodyHtml: paragraphs(ticket.title),
      ticketUrl: ticketUrl(ticket.publicId),
      ticketPublicId: ticket.publicId,
    }),
  };
}

export function slaBreachedMail(ticket: TicketMailContext, deadlineLabel: string): MailTemplate {
  return {
    subject: subject(ticket.publicId, ticket.title, "SLA breached"),
    html: layout({
      heading: `SLA breached (${deadlineLabel})`,
      intro: "This ticket missed its SLA deadline. Please act on it right away.",
      bodyHtml: paragraphs(ticket.title),
      ticketUrl: ticketUrl(ticket.publicId),
      ticketPublicId: ticket.publicId,
    }),
  };
}

export function ticketResolvedMail(
  ticket: TicketMailContext,
  priority: string,
): MailTemplate {
  const priorityLabel = PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS] ?? priority;
  return {
    subject: subject(ticket.publicId, ticket.title, "Resolved — how did we do?"),
    html: layout({
      heading: "Your ticket was resolved",
      intro: `Marked resolved (priority ${priorityLabel}). If everything works, you don't need to do anything — otherwise just reply and we'll reopen it.`,
      bodyHtml: paragraphs(
        "How was the support you received? You can rate this ticket from the ticket page — your feedback helps us improve.",
      ),
      ticketUrl: ticketUrl(ticket.publicId),
      ticketPublicId: ticket.publicId,
    }),
  };
}

export function ticketEscalatedMail(
  ticket: TicketMailContext,
  detail: string,
  actorName: string | null,
): MailTemplate {
  return {
    subject: subject(ticket.publicId, ticket.title, "Escalated"),
    html: layout({
      heading: "Ticket escalated",
      intro: actorName
        ? `${actorName} escalated this ticket: ${detail}.`
        : `This ticket was escalated automatically: ${detail}.`,
      bodyHtml: paragraphs(ticket.title),
      ticketUrl: ticketUrl(ticket.publicId),
      ticketPublicId: ticket.publicId,
    }),
  };
}
