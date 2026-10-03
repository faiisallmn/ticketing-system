import type { NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { computeDueDatesFor } from "@/lib/sla/service";
import { emitWebhookEvent, notifyUsers, ticketPayload } from "@/lib/notifications/service";
import {
  statusChangedMail,
  ticketAssignedMail,
  ticketResolvedMail,
} from "@/lib/email/templates";
import { STATUS_LABELS } from "@/lib/labels";
import { canAccessTicket, isAssignableRole } from "@/lib/tickets/access";
import { logTicketEvent, type TicketEventInput } from "@/lib/tickets/audit";
import { allowedTransitions, canTransition } from "@/lib/tickets/transitions";
import {
  assignTicketSchema,
  updateTicketPrioritySchema,
  updateTicketSeveritySchema,
  updateTicketStatusSchema,
} from "@/lib/tickets/validation";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiOk } from "@/lib/api/respond";
import { TICKET_INCLUDE, serializeTicket } from "@/lib/api/serializers";
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
  const ticket = await db.ticket.findUnique({
    where: { publicId },
    include: {
      ...TICKET_INCLUDE,
      comments: {
        where: actor.user.role === "REQUESTER" ? { isInternal: false } : {},
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          isInternal: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      },
    },
  });
  if (!ticket || !canAccessTicket(actor.user, ticket.requesterId)) {
    return apiError(404, "not_found", "Ticket not found.", rateHeaders);
  }

  const { comments, ...rest } = ticket;
  return apiOk(
    {
      ...serializeTicket(rest),
      comments: comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        isInternal: comment.isInternal,
        author: comment.author.name,
        createdAt: comment.createdAt,
      })),
    },
    undefined,
    rateHeaders,
  );
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

  const wantsAssign = "assigneeId" in body || "teamId" in body;
  const wantsUpdate =
    "status" in body || "priority" in body || "severity" in body || "categoryId" in body;
  if (!wantsAssign && !wantsUpdate) {
    return apiError(400, "nothing_to_update", "Provide at least one updatable field.", rateHeaders);
  }
  if (wantsAssign && !can(user.role, "ticket:assign")) {
    return apiError(403, "forbidden", "Your role cannot assign tickets.", rateHeaders);
  }
  if (wantsUpdate && !can(user.role, "ticket:update")) {
    return apiError(403, "forbidden", "Your role cannot update tickets.", rateHeaders);
  }

  const now = new Date();
  const data: Prisma.TicketUpdateInput = {};
  const pendingEvents: TicketEventInput[] = [];
  let statusChanged: string | null = null;
  let newAssignee: { id: string; name: string } | null = null;
  let assigneeChanged = false;

  if ("status" in body) {
    const parsed = updateTicketStatusSchema.safeParse({ status: body.status });
    if (!parsed.success) {
      return apiError(400, "validation_error", "Invalid status.", rateHeaders);
    }
    const nextStatus = parsed.data.status;
    if (!canTransition(ticket.status, nextStatus)) {
      return apiError(
        422,
        "illegal_transition",
        `Cannot move from ${ticket.status} to ${nextStatus}. Allowed: ${allowedTransitions(ticket.status).join(", ") || "none"}.`,
        rateHeaders,
      );
    }
    if (nextStatus === "CLOSED" && !can(user.role, "ticket:close")) {
      return apiError(403, "forbidden", "Your role cannot close tickets.", rateHeaders);
    }
    if (nextStatus === "REOPENED" && !can(user.role, "ticket:reopen")) {
      return apiError(403, "forbidden", "Your role cannot reopen tickets.", rateHeaders);
    }
    const reopenDues =
      nextStatus === "REOPENED"
        ? await computeDueDatesFor(ticket.categoryId, ticket.priority, now)
        : null;
    Object.assign(data, {
      status: nextStatus,
      firstRespondedAt: ticket.firstRespondedAt ?? now,
      resolvedAt:
        nextStatus === "RESOLVED" ? now : nextStatus === "REOPENED" ? null : ticket.resolvedAt,
      closedAt: nextStatus === "CLOSED" ? now : nextStatus === "REOPENED" ? null : ticket.closedAt,
      reopenedAt: nextStatus === "REOPENED" ? now : ticket.reopenedAt,
      waitingSinceAt:
        nextStatus === "WAITING_ON_CUSTOMER" ? (ticket.waitingSinceAt ?? now) : null,
      ...(reopenDues ? { dueResolutionAt: reopenDues.dueResolutionAt } : {}),
    });
    if (nextStatus !== ticket.status) {
      statusChanged = nextStatus;
      pendingEvents.push({
        ticketId: ticket.id,
        actorId: user.id,
        type: "STATUS_CHANGED",
        field: "status",
        oldValue: ticket.status,
        newValue: nextStatus,
      });
    }
  }

  if ("priority" in body) {
    const parsed = updateTicketPrioritySchema.safeParse({ priority: body.priority });
    if (!parsed.success) {
      return apiError(400, "validation_error", "Invalid priority.", rateHeaders);
    }
    if (parsed.data.priority !== ticket.priority) {
      const dues = await computeDueDatesFor(ticket.categoryId, parsed.data.priority, now);
      Object.assign(data, { priority: parsed.data.priority, ...(dues ?? {}) });
      pendingEvents.push({
        ticketId: ticket.id,
        actorId: user.id,
        type: "PRIORITY_CHANGED",
        field: "priority",
        oldValue: ticket.priority,
        newValue: parsed.data.priority,
      });
    }
  }

  if ("severity" in body) {
    const parsed = updateTicketSeveritySchema.safeParse({ severity: body.severity });
    if (!parsed.success) {
      return apiError(400, "validation_error", "Invalid severity.", rateHeaders);
    }
    if (parsed.data.severity !== ticket.severity) {
      Object.assign(data, { severity: parsed.data.severity });
      pendingEvents.push({
        ticketId: ticket.id,
        actorId: user.id,
        type: "SEVERITY_CHANGED",
        field: "severity",
        oldValue: ticket.severity,
        newValue: parsed.data.severity,
      });
    }
  }

  if ("categoryId" in body) {
    const raw = body.categoryId;
    const categoryId = raw === null ? null : String(raw || "").trim() || null;
    if ((categoryId ?? null) !== (ticket.categoryId ?? null)) {
      const category = categoryId
        ? await db.category.findFirst({ where: { id: categoryId, isActive: true } })
        : null;
      if (categoryId && !category) {
        return apiError(422, "unknown_category", "Selected category does not exist.", rateHeaders);
      }
      const dues = await computeDueDatesFor(categoryId, ticket.priority, now);
      Object.assign(data, { categoryId, ...(dues ?? {}) });
      pendingEvents.push({
        ticketId: ticket.id,
        actorId: user.id,
        type: "CATEGORY_CHANGED",
        field: "category",
        newValue: category?.name ?? "Uncategorized",
      });
    }
  }

  if (wantsAssign) {
    const parsed = assignTicketSchema.safeParse({
      assigneeId: "assigneeId" in body ? (body.assigneeId as string | null) : ticket.assigneeId,
      teamId: "teamId" in body ? (body.teamId as string | null) : ticket.teamId,
    });
    if (!parsed.success) {
      return apiError(400, "validation_error", "Invalid assignment.", rateHeaders);
    }
    const [assignee, team] = await Promise.all([
      parsed.data.assigneeId
        ? db.user.findFirst({ where: { id: parsed.data.assigneeId, isActive: true } })
        : Promise.resolve(null),
      parsed.data.teamId
        ? db.team.findUnique({ where: { id: parsed.data.teamId } })
        : Promise.resolve(null),
    ]);
    if (parsed.data.assigneeId && (!assignee || !isAssignableRole(assignee.role))) {
      return apiError(422, "invalid_assignee", "Assignee must be an active staff member.", rateHeaders);
    }
    if (parsed.data.teamId && !team) {
      return apiError(422, "unknown_team", "Selected team does not exist.", rateHeaders);
    }
    const teamChanged = (ticket.teamId ?? null) !== (parsed.data.teamId ?? null);
    const personChanged = (ticket.assigneeId ?? null) !== (parsed.data.assigneeId ?? null);
    if (personChanged || teamChanged) {
      Object.assign(data, { assigneeId: parsed.data.assigneeId, teamId: parsed.data.teamId });
    }
    if (personChanged) {
      assigneeChanged = true;
      newAssignee = assignee ? { id: assignee.id, name: assignee.name } : null;
      pendingEvents.push({
        ticketId: ticket.id,
        actorId: user.id,
        type: parsed.data.assigneeId ? "ASSIGNED" : "UNASSIGNED",
        field: "assignee",
        newValue: assignee?.name ?? "Unassigned",
      });
    }
  }

  if (Object.keys(data).length === 0) {
    return apiError(400, "nothing_to_update", "No changes detected.", rateHeaders);
  }

  await db.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: ticket.id }, data });
    for (const event of pendingEvents) {
      await logTicketEvent(tx, event);
    }
  });

  try {
    if (statusChanged) {
      const recipients = [ticket.requesterId, ticket.assigneeId].filter(
        (id): id is string => !!id && id !== user.id,
      );
      if (recipients.length > 0) {
        const isResolved = statusChanged === "RESOLVED";
        await notifyUsers({
          userIds: recipients,
          ticketId: ticket.id,
          type: isResolved ? "CSAT_REQUEST" : "STATUS_CHANGED",
          title: isResolved
            ? `Resolved: ${ticket.publicId} — how did we do?`
            : `${ticket.publicId} → ${STATUS_LABELS[statusChanged as keyof typeof STATUS_LABELS] ?? statusChanged}`,
          body: ticket.title,
          email:
            isResolved && recipients.includes(ticket.requesterId)
              ? { template: "ticket-resolved", ...ticketResolvedMail(ticket, ticket.priority) }
              : {
                  template: "status-changed",
                  ...statusChangedMail(ticket, ticket.status, statusChanged, user.name),
                },
        });
      }
    }
    if (assigneeChanged && newAssignee) {
      await notifyUsers({
        userIds: [newAssignee.id],
        ticketId: ticket.id,
        type: "TICKET_ASSIGNED",
        title: `You were assigned ${ticket.publicId}`,
        body: ticket.title,
        email: {
          template: "ticket-assigned",
          ...ticketAssignedMail(ticket, newAssignee.name, user.name),
        },
      });
    }
    await emitWebhookEvent("TICKET_UPDATED", ticket.id, ticketPayload(ticket, "Updated via API"));
  } catch (error) {
    console.error(`[api] notify failed for ${ticket.publicId}`, error);
  }

  const full = await db.ticket.findUniqueOrThrow({
    where: { id: ticket.id },
    include: TICKET_INCLUDE,
  });
  return apiOk(serializeTicket(full), undefined, rateHeaders);
}
