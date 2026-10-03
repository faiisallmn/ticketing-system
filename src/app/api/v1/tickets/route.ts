import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { enqueueAutoAssign } from "@/lib/queue";
import { computeDueDatesFor } from "@/lib/sla/service";
import { emitWebhookEvent, notifyUsers, ticketPayload } from "@/lib/notifications/service";
import { ticketAssignedMail, ticketReceivedMail } from "@/lib/email/templates";
import { isAssignableRole } from "@/lib/tickets/access";
import { logTicketEvent } from "@/lib/tickets/audit";
import { nextPublicId } from "@/lib/tickets/ids";
import { searchTicketIds } from "@/lib/tickets/search";
import { createTicketSchema } from "@/lib/tickets/validation";
import { guardApi } from "@/lib/api/guard";
import { apiError, apiOk } from "@/lib/api/respond";
import { TICKET_INCLUDE, serializeTicket } from "@/lib/api/serializers";

function parsePositiveInt(raw: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "tickets:read");
  if ("response" in guard) return guard.response;
  const { actor, rateHeaders } = guard;

  const params = request.nextUrl.searchParams;
  const page = parsePositiveInt(params.get("page"), 1, 10000);
  const perPage = parsePositiveInt(params.get("per_page"), 25, 100);

  const { ids, total } = await searchTicketIds(
    actor.user,
    {
      q: params.get("q") ?? undefined,
      status: params.get("status"),
      priority: params.get("priority"),
      assigneeId: params.get("assignee_id"),
      unassigned: params.get("unassigned") === "1",
      teamId: params.get("team_id"),
      categoryId: params.get("category_id"),
      tagId: params.get("tag_id"),
      departmentId: params.get("department_id"),
      breached: params.get("breached") === "1",
    },
    page,
    perPage,
  );

  const rows = await db.ticket.findMany({
    where: { id: { in: ids } },
    include: TICKET_INCLUDE,
  });
  const byId = new Map(rows.map((ticket) => [ticket.id, ticket]));
  const data = ids.flatMap((id) => {
    const ticket = byId.get(id);
    return ticket ? [serializeTicket(ticket)] : [];
  });

  return apiOk(data, { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) }, rateHeaders);
}

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "tickets:write");
  if ("response" in guard) return guard.response;
  const { actor, rateHeaders } = guard;
  const user = actor.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.", rateHeaders);
  }

  const parsed = createTicketSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid input.", rateHeaders);
  }
  const input = parsed.data;

  const isStaff = user.role !== "REQUESTER";
  if (!isStaff && (input.assigneeId ?? input.teamId ?? input.requesterId)) {
    return apiError(403, "forbidden", "Requesters cannot assign tickets or file for others.", rateHeaders);
  }
  const requesterId = isStaff && input.requesterId ? input.requesterId : user.id;

  const [requester, assignee, team, department, category, tagCount] = await Promise.all([
    db.user.findFirst({ where: { id: requesterId, isActive: true } }),
    input.assigneeId
      ? db.user.findFirst({ where: { id: input.assigneeId, isActive: true } })
      : Promise.resolve(null),
    input.teamId ? db.team.findUnique({ where: { id: input.teamId } }) : Promise.resolve(null),
    input.departmentId
      ? db.department.findUnique({ where: { id: input.departmentId } })
      : Promise.resolve(null),
    input.categoryId
      ? db.category.findFirst({ where: { id: input.categoryId, isActive: true } })
      : Promise.resolve(null),
    input.tagIds.length > 0
      ? db.tag.count({ where: { id: { in: input.tagIds } } })
      : Promise.resolve(0),
  ]);

  if (!requester) return apiError(422, "unknown_requester", "Selected requester does not exist.", rateHeaders);
  if (input.assigneeId && (!assignee || !isAssignableRole(assignee.role))) {
    return apiError(422, "invalid_assignee", "Assignee must be an active staff member.", rateHeaders);
  }
  if (input.teamId && !team) return apiError(422, "unknown_team", "Selected team does not exist.", rateHeaders);
  if (input.departmentId && !department) {
    return apiError(422, "unknown_department", "Selected department does not exist.", rateHeaders);
  }
  if (input.categoryId && !category) {
    return apiError(422, "unknown_category", "Selected category does not exist.", rateHeaders);
  }
  if (tagCount !== input.tagIds.length) {
    return apiError(422, "unknown_tag", "One or more tags do not exist.", rateHeaders);
  }
  if (!can(user.role, "ticket:create")) {
    return apiError(403, "forbidden", "Your role cannot create tickets.", rateHeaders);
  }

  const now = new Date();
  const dues = await computeDueDatesFor(input.categoryId, input.priority, now);

  const ticket = await db.$transaction(async (tx) => {
    const created = await tx.ticket.create({
      data: {
        publicId: await nextPublicId(tx),
        title: input.title,
        description: input.description,
        priority: input.priority,
        severity: input.severity,
        source: "API",
        requesterId,
        assigneeId: input.assigneeId,
        teamId: input.teamId,
        departmentId: input.departmentId,
        categoryId: input.categoryId,
        ...(dues ?? {}),
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      },
    });
    await logTicketEvent(tx, {
      ticketId: created.id,
      actorId: user.id,
      type: "CREATED",
      metadata: { source: "API", apiKeyId: actor.keyId },
    });
    if (input.assigneeId && assignee) {
      await logTicketEvent(tx, {
        ticketId: created.id,
        actorId: user.id,
        type: "ASSIGNED",
        newValue: assignee.name,
      });
    }
    return created;
  });

  try {
    await notifyUsers({
      userIds: [requesterId],
      ticketId: ticket.id,
      type: "TICKET_CREATED",
      title: `Ticket ${ticket.publicId} received`,
      body: ticket.title,
      email: { template: "ticket-received", ...ticketReceivedMail(ticket, requester.name) },
    });
    if (input.assigneeId && input.assigneeId !== requesterId && assignee) {
      await notifyUsers({
        userIds: [input.assigneeId],
        ticketId: ticket.id,
        type: "TICKET_ASSIGNED",
        title: `You were assigned ${ticket.publicId}`,
        body: ticket.title,
        email: { template: "ticket-assigned", ...ticketAssignedMail(ticket, assignee.name, user.name) },
      });
    }
    await emitWebhookEvent("TICKET_CREATED", ticket.id, ticketPayload(ticket, `Priority ${ticket.priority}`));
    if (!input.assigneeId) {
      await enqueueAutoAssign(ticket.id).catch(() => undefined);
    }
  } catch (error) {
    console.error(`[api] notify failed for ${ticket.publicId}`, error);
  }

  const full = await db.ticket.findUniqueOrThrow({
    where: { id: ticket.id },
    include: TICKET_INCLUDE,
  });
  return apiOk(serializeTicket(full), undefined, rateHeaders);
}
