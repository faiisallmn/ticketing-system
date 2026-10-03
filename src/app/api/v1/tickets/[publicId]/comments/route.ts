import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { emitWebhookEvent, notifyUsers, ticketPayload } from "@/lib/notifications/service";
import { commentAddedMail } from "@/lib/email/templates";
import { canAccessTicket } from "@/lib/tickets/access";
import { logTicketEvent } from "@/lib/tickets/audit";
import { addCommentSchema } from "@/lib/tickets/validation";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiOk } from "@/lib/api/respond";
import type { ApiActor } from "@/lib/api/auth";

type RouteParams = { params: Promise<{ publicId: string }> };

async function loadTicket(actor: ApiActor["user"], publicId: string) {
  const ticket = await db.ticket.findUnique({ where: { publicId } });
  if (!ticket || !canAccessTicket(actor, ticket.requesterId)) return null;
  return ticket;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const guard = await guardApi(request, "tickets:read");
  if ("response" in guard) return guard.response;
  const { actor, rateHeaders } = guard;

  const { publicId } = await params;
  const ticket = await loadTicket(actor.user, publicId);
  if (!ticket) {
    return apiError(404, "not_found", "Ticket not found.", rateHeaders);
  }

  const comments = await db.comment.findMany({
    where: {
      ticketId: ticket.id,
      ...(actor.user.role === "REQUESTER" ? { isInternal: false } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      body: true,
      isInternal: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });

  return apiOk(
    comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      isInternal: comment.isInternal,
      author: comment.author.name,
      createdAt: comment.createdAt,
    })),
    undefined,
    rateHeaders,
  );
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const guard = await guardApi(request, "tickets:write");
  if ("response" in guard) return guard.response;
  const { actor, rateHeaders } = guard;
  const user = actor.user;

  const { publicId } = await params;
  const ticket = await loadTicket(user, publicId);
  if (!ticket) {
    return apiError(404, "not_found", "Ticket not found.", rateHeaders);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.", rateHeaders);
  }

  const wantsInternal = body.isInternal === true;
  if (wantsInternal && !can(user.role, "comment:create:internal")) {
    return apiError(403, "forbidden", "Your role cannot write internal notes.", rateHeaders);
  }
  if (!wantsInternal && !can(user.role, "comment:create:public")) {
    return apiError(403, "forbidden", "Your role cannot comment on tickets.", rateHeaders);
  }

  const parsed = addCommentSchema.safeParse({ body: body.body, isInternal: wantsInternal });
  if (!parsed.success) {
    return apiError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid comment.", rateHeaders);
  }

  const isStaff = user.role !== "REQUESTER";
  const comment = await db.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        ticketId: ticket.id,
        authorId: user.id,
        body: parsed.data.body,
        isInternal: parsed.data.isInternal,
      },
    });
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        firstRespondedAt:
          isStaff && !parsed.data.isInternal && !ticket.firstRespondedAt
            ? new Date()
            : ticket.firstRespondedAt,
      },
    });
    await logTicketEvent(tx, {
      ticketId: ticket.id,
      actorId: user.id,
      type: "COMMENT_ADDED",
      metadata: { isInternal: parsed.data.isInternal, source: "API" },
    });
    return created;
  });

  try {
    if (parsed.data.isInternal) {
      if (ticket.assigneeId && ticket.assigneeId !== user.id) {
        await notifyUsers({
          userIds: [ticket.assigneeId],
          ticketId: ticket.id,
          type: "COMMENT_ADDED",
          title: `Internal note on ${ticket.publicId}`,
          body: ticket.title,
          email: {
            template: "comment-added",
            ...commentAddedMail(ticket, user.name, parsed.data.body),
          },
        });
      }
    } else {
      const recipients = [ticket.requesterId, ticket.assigneeId].filter(
        (id): id is string => !!id && id !== user.id,
      );
      if (recipients.length > 0) {
        await notifyUsers({
          userIds: recipients,
          ticketId: ticket.id,
          type: "COMMENT_ADDED",
          title: `New reply on ${ticket.publicId}`,
          body: ticket.title,
          email: {
            template: "comment-added",
            ...commentAddedMail(ticket, user.name, parsed.data.body),
          },
        });
      }
      await emitWebhookEvent(
        "COMMENT_ADDED",
        ticket.id,
        ticketPayload(ticket, `Reply by ${user.name} (API)`),
      );
    }
  } catch (error) {
    console.error(`[api] notify failed for ${ticket.publicId}`, error);
  }

  return apiOk(
    {
      id: comment.id,
      body: comment.body,
      isInternal: comment.isInternal,
      author: user.name,
      createdAt: comment.createdAt,
    },
    undefined,
    rateHeaders,
  );
}
