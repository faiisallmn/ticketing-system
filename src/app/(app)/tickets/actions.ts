"use server";

import { revalidatePath } from "next/cache";
import { forbidden, notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { enqueueAutoAssign } from "@/lib/queue";
import { computeDueDatesFor } from "@/lib/sla/service";
import { emitWebhookEvent, notifyUsers, ticketPayload } from "@/lib/notifications/service";
import {
  commentAddedMail,
  statusChangedMail,
  ticketAssignedMail,
  ticketReceivedMail,
  ticketResolvedMail,
} from "@/lib/email/templates";
import { STATUS_LABELS } from "@/lib/labels";
import { submitCsatSchema } from "@/lib/tickets/validation";
import { canAccessTicket, isAssignableRole } from "@/lib/tickets/access";
import { logTicketEvent } from "@/lib/tickets/audit";
import { allowedTransitions, canTransition } from "@/lib/tickets/transitions";
import {
  addCommentSchema,
  assignTicketSchema,
  createTicketSchema,
  updateTicketDetailsSchema,
  updateTicketPrioritySchema,
  updateTicketSeveritySchema,
  updateTicketStatusSchema,
} from "@/lib/tickets/validation";

export type ActionState = { error?: string } | undefined;

async function loadTicketForMutation(ticketId: string) {
  const user = await requireUser();
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) notFound();
  if (!canAccessTicket(user, ticket.requesterId)) notFound();
  return { user, ticket };
}

function revalidateTicket(publicId: string) {
  revalidatePath(`/tickets/${publicId}`);
  revalidatePath("/tickets");
}

export async function createTicket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!can(user.role, "ticket:create")) forbidden();

  const parsed = createTicketSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    priority: formData.get("priority") || undefined,
    severity: formData.get("severity") || undefined,
    categoryId: formData.get("categoryId"),
    departmentId: formData.get("departmentId"),
    teamId: formData.get("teamId"),
    assigneeId: formData.get("assigneeId"),
    requesterId: formData.get("requesterId"),
    tagIds: formData.getAll("tagIds").map(String),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const isStaff = user.role !== "REQUESTER";
  if (!isStaff && (input.assigneeId ?? input.teamId ?? input.requesterId)) {
    return { error: "You cannot assign tickets or file them for someone else." };
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

  if (!requester) return { error: "Selected requester does not exist." };
  if (input.assigneeId && (!assignee || !isAssignableRole(assignee.role))) {
    return { error: "Assignee must be an active staff member." };
  }
  if (input.teamId && !team) return { error: "Selected team does not exist." };
  if (input.departmentId && !department) return { error: "Selected department does not exist." };
  if (input.categoryId && !category) return { error: "Selected category does not exist." };
  if (tagCount !== input.tagIds.length) return { error: "One or more tags do not exist." };

  const now = new Date();
  const dues = await computeDueDatesFor(input.categoryId, input.priority, now);

  const ticket = await db.$transaction(async (tx) => {
    const [{ n }] =
      await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('ticket_public_id_seq') AS n`;
    const publicId = `TK-${n.toString().padStart(6, "0")}`;

    const created = await tx.ticket.create({
      data: {
        publicId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        severity: input.severity,
        source: "WEB",
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
      metadata: { source: "WEB" },
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

  revalidatePath("/tickets");

  // Notifications never break ticket creation.
  try {
    await notifyUsers({
      userIds: [requesterId],
      ticketId: ticket.id,
      type: "TICKET_CREATED",
      title: `Ticket ${ticket.publicId} received`,
      body: ticket.title,
      email: {
        template: "ticket-received",
        ...ticketReceivedMail(ticket, requester.name),
      },
    });
    if (input.assigneeId && input.assigneeId !== requesterId && assignee) {
      await notifyUsers({
        userIds: [input.assigneeId],
        ticketId: ticket.id,
        type: "TICKET_ASSIGNED",
        title: `You were assigned ${ticket.publicId}`,
        body: ticket.title,
        email: {
          template: "ticket-assigned",
          ...ticketAssignedMail(ticket, assignee.name, user.name),
        },
      });
    }
    await emitWebhookEvent(
      "TICKET_CREATED",
      ticket.id,
      ticketPayload(ticket, `Priority ${ticket.priority}`),
    );
  } catch (error) {
    console.error(`[tickets] notify failed for ${ticket.publicId}`, error);
  }

  if (!input.assigneeId) {
    // Best effort: a ticket must never fail to create because the queue is down.
    try {
      await enqueueAutoAssign(ticket.id);
    } catch (error) {
      console.error(`[tickets] auto-assign enqueue failed for ${ticket.publicId}`, error);
    }
  }
  redirect(`/tickets/${ticket.publicId}`);
}

export async function updateTicketStatus(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, ticket } = await loadTicketForMutation(ticketId);
  if (!can(user.role, "ticket:update")) forbidden();

  const parsed = updateTicketStatusSchema.safeParse({ status: formData.get("status") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid status." };
  }
  const nextStatus = parsed.data.status;

  if (!canTransition(ticket.status, nextStatus)) {
    return {
      error: `Cannot move from ${ticket.status} to ${nextStatus}. Allowed: ${allowedTransitions(ticket.status).join(", ") || "none"}.`,
    };
  }
  if (nextStatus === "CLOSED" && !can(user.role, "ticket:close")) forbidden();
  if (nextStatus === "REOPENED" && !can(user.role, "ticket:reopen")) forbidden();

  const now = new Date();
  // Reopening restarts the resolution clock under the current policy.
  const reopenDues =
    nextStatus === "REOPENED"
      ? await computeDueDatesFor(ticket.categoryId, ticket.priority, now)
      : null;

  await db.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: nextStatus,
        firstRespondedAt: ticket.firstRespondedAt ?? now,
        resolvedAt: nextStatus === "RESOLVED" ? now : nextStatus === "REOPENED" ? null : ticket.resolvedAt,
        closedAt: nextStatus === "CLOSED" ? now : nextStatus === "REOPENED" ? null : ticket.closedAt,
        reopenedAt: nextStatus === "REOPENED" ? now : ticket.reopenedAt,
        waitingSinceAt:
          nextStatus === "WAITING_ON_CUSTOMER" ? (ticket.waitingSinceAt ?? now) : null,
        ...(reopenDues ? { dueResolutionAt: reopenDues.dueResolutionAt } : {}),
      },
    });
    await logTicketEvent(tx, {
      ticketId: ticket.id,
      actorId: user.id,
      type: "STATUS_CHANGED",
      field: "status",
      oldValue: ticket.status,
      newValue: nextStatus,
    });
  });

  try {
    const requesterInvolved = ticket.requesterId !== user.id;
    const assigneeInvolved =
      !!ticket.assigneeId && ticket.assigneeId !== user.id && ticket.assigneeId !== ticket.requesterId;

    if (nextStatus === "RESOLVED") {
      if (requesterInvolved) {
        await notifyUsers({
          userIds: [ticket.requesterId],
          ticketId: ticket.id,
          type: "CSAT_REQUEST",
          title: `Resolved: ${ticket.publicId} — how did we do?`,
          body: ticket.title,
          email: {
            template: "ticket-resolved",
            ...ticketResolvedMail(ticket, ticket.priority),
          },
        });
      }
      if (assigneeInvolved && ticket.assigneeId) {
        await notifyUsers({
          userIds: [ticket.assigneeId],
          ticketId: ticket.id,
          type: "STATUS_CHANGED",
          title: `${ticket.publicId} resolved`,
          body: ticket.title,
          email: {
            template: "status-changed",
            ...statusChangedMail(ticket, ticket.status, nextStatus, user.name),
          },
        });
      }
    } else if (requesterInvolved || assigneeInvolved) {
      const recipients = [
        ...(requesterInvolved ? [ticket.requesterId] : []),
        ...(assigneeInvolved && ticket.assigneeId ? [ticket.assigneeId] : []),
      ];
      await notifyUsers({
        userIds: recipients,
        ticketId: ticket.id,
        type: "STATUS_CHANGED",
        title: `${ticket.publicId} → ${STATUS_LABELS[nextStatus] ?? nextStatus}`,
        body: ticket.title,
        email: {
          template: "status-changed",
          ...statusChangedMail(ticket, ticket.status, nextStatus, user.name),
        },
      });
    }
    await emitWebhookEvent(
      "TICKET_UPDATED",
      ticket.id,
      ticketPayload(ticket, `Status ${ticket.status} → ${nextStatus}`),
    );
  } catch (error) {
    console.error(`[tickets] notify failed for ${ticket.publicId}`, error);
  }

  revalidateTicket(ticket.publicId);
}

export async function updateTicketPriority(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, ticket } = await loadTicketForMutation(ticketId);
  if (!can(user.role, "ticket:update")) forbidden();

  const parsed = updateTicketPrioritySchema.safeParse({ priority: formData.get("priority") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid priority." };
  }

  // Deadlines follow the new priority from this moment on.
  const dues = await computeDueDatesFor(ticket.categoryId, parsed.data.priority, new Date());

  await db.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { priority: parsed.data.priority, ...(dues ?? {}) },
    });
    await logTicketEvent(tx, {
      ticketId: ticket.id,
      actorId: user.id,
      type: "PRIORITY_CHANGED",
      field: "priority",
      oldValue: ticket.priority,
      newValue: parsed.data.priority,
      metadata: dues
        ? {
            dueResponseAt: dues.dueResponseAt.toISOString(),
            dueResolutionAt: dues.dueResolutionAt.toISOString(),
          }
        : undefined,
    });
  });

  revalidateTicket(ticket.publicId);
}

export async function updateTicketSeverity(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, ticket } = await loadTicketForMutation(ticketId);
  if (!can(user.role, "ticket:update")) forbidden();

  const parsed = updateTicketSeveritySchema.safeParse({ severity: formData.get("severity") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid severity." };
  }

  await db.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: ticket.id }, data: { severity: parsed.data.severity } });
    await logTicketEvent(tx, {
      ticketId: ticket.id,
      actorId: user.id,
      type: "SEVERITY_CHANGED",
      field: "severity",
      oldValue: ticket.severity,
      newValue: parsed.data.severity,
    });
  });

  revalidateTicket(ticket.publicId);
}

export async function assignTicket(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, ticket } = await loadTicketForMutation(ticketId);
  if (!can(user.role, "ticket:assign")) forbidden();

  const parsed = assignTicketSchema.safeParse({
    assigneeId: formData.get("assigneeId"),
    teamId: formData.get("teamId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid assignment." };
  }

  const [assignee, team, oldAssignee, oldTeam] = await Promise.all([
    parsed.data.assigneeId
      ? db.user.findFirst({ where: { id: parsed.data.assigneeId, isActive: true } })
      : Promise.resolve(null),
    parsed.data.teamId
      ? db.team.findUnique({ where: { id: parsed.data.teamId } })
      : Promise.resolve(null),
    ticket.assigneeId
      ? db.user.findUnique({ where: { id: ticket.assigneeId }, select: { name: true } })
      : Promise.resolve(null),
    ticket.teamId
      ? db.team.findUnique({ where: { id: ticket.teamId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  if (parsed.data.assigneeId && (!assignee || !isAssignableRole(assignee.role))) {
    return { error: "Assignee must be an active staff member." };
  }
  if (parsed.data.teamId && !team) return { error: "Selected team does not exist." };

  const assigneeChanged = (ticket.assigneeId ?? null) !== (parsed.data.assigneeId ?? null);
  const teamChanged = (ticket.teamId ?? null) !== (parsed.data.teamId ?? null);
  if (!assigneeChanged && !teamChanged) {
    revalidateTicket(ticket.publicId);
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { assigneeId: parsed.data.assigneeId, teamId: parsed.data.teamId },
    });

    if ((ticket.assigneeId ?? null) !== (parsed.data.assigneeId ?? null)) {
      await logTicketEvent(tx, {
        ticketId: ticket.id,
        actorId: user.id,
        type: parsed.data.assigneeId ? "ASSIGNED" : "UNASSIGNED",
        field: "assignee",
        oldValue: oldAssignee?.name ?? "Unassigned",
        newValue: assignee?.name ?? "Unassigned",
      });
    }
    if ((ticket.teamId ?? null) !== (parsed.data.teamId ?? null)) {
      await logTicketEvent(tx, {
        ticketId: ticket.id,
        actorId: user.id,
        type: "TEAM_CHANGED",
        field: "team",
        oldValue: oldTeam?.name ?? "No team",
        newValue: team?.name ?? "No team",
      });
    }
  });

  try {
    if (assigneeChanged && assignee) {
      await notifyUsers({
        userIds: [assignee.id],
        ticketId: ticket.id,
        type: "TICKET_ASSIGNED",
        title: `You were assigned ${ticket.publicId}`,
        body: ticket.title,
        email: {
          template: "ticket-assigned",
          ...ticketAssignedMail(ticket, assignee.name, user.name),
        },
      });
    }
    await emitWebhookEvent(
      "TICKET_UPDATED",
      ticket.id,
      ticketPayload(
        ticket,
        assigneeChanged
          ? `Assigned to ${assignee?.name ?? "nobody"}`
          : `Team changed to ${team?.name ?? "no team"}`,
      ),
    );
  } catch (error) {
    console.error(`[tickets] notify failed for ${ticket.publicId}`, error);
  }

  revalidateTicket(ticket.publicId);
}

export async function updateTicketDetails(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, ticket } = await loadTicketForMutation(ticketId);
  if (!can(user.role, "ticket:update")) forbidden();

  const parsed = updateTicketDetailsSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    departmentId: formData.get("departmentId"),
    tagIds: formData.getAll("tagIds").map(String),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  const [department, category, tagCount, currentTagIds, oldCategory, oldDepartment] =
    await Promise.all([
      input.departmentId
        ? db.department.findUnique({ where: { id: input.departmentId } })
        : Promise.resolve(null),
      input.categoryId
        ? db.category.findFirst({ where: { id: input.categoryId, isActive: true } })
        : Promise.resolve(null),
      input.tagIds.length > 0
        ? db.tag.count({ where: { id: { in: input.tagIds } } })
        : Promise.resolve(0),
      db.ticketTag.findMany({ where: { ticketId: ticket.id }, select: { tagId: true } }),
      ticket.categoryId
        ? db.category.findUnique({ where: { id: ticket.categoryId }, select: { name: true } })
        : Promise.resolve(null),
      ticket.departmentId
        ? db.department.findUnique({
            where: { id: ticket.departmentId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);

  if (input.departmentId && !department) return { error: "Selected department does not exist." };
  if (input.categoryId && !category) return { error: "Selected category does not exist." };
  if (tagCount !== input.tagIds.length) return { error: "One or more tags do not exist." };

  const changedFields: string[] = [];
  if (input.title !== ticket.title) changedFields.push("title");
  if (input.description !== ticket.description) changedFields.push("description");
  if ((input.categoryId ?? null) !== (ticket.categoryId ?? null)) changedFields.push("category");
  if ((input.departmentId ?? null) !== (ticket.departmentId ?? null)) changedFields.push("department");

  const previousTags = new Set(currentTagIds.map((row) => row.tagId));
  const nextTags = new Set(input.tagIds);
  const tagsChanged =
    previousTags.size !== nextTags.size ||
    [...previousTags].some((tagId) => !nextTags.has(tagId));

  const categoryChanged = (input.categoryId ?? null) !== (ticket.categoryId ?? null);
  // Deadlines follow the policy of the new category.
  const dues = categoryChanged
    ? await computeDueDatesFor(input.categoryId, ticket.priority, new Date())
    : null;

  await db.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        title: input.title,
        description: input.description,
        categoryId: input.categoryId,
        departmentId: input.departmentId,
        ...(dues ?? {}),
      },
    });

    if (tagsChanged) {
      await tx.ticketTag.deleteMany({ where: { ticketId: ticket.id } });
      if (input.tagIds.length > 0) {
        await tx.ticketTag.createMany({
          data: input.tagIds.map((tagId) => ({ ticketId: ticket.id, tagId })),
        });
      }
    }

    if (categoryChanged) {
      await logTicketEvent(tx, {
        ticketId: ticket.id,
        actorId: user.id,
        type: "CATEGORY_CHANGED",
        field: "category",
        oldValue: oldCategory?.name ?? "Uncategorized",
        newValue: category?.name ?? "Uncategorized",
        metadata: dues ? { duesRecomputed: true } : undefined,
      });
    }
    if ((input.departmentId ?? null) !== (ticket.departmentId ?? null)) {
      await logTicketEvent(tx, {
        ticketId: ticket.id,
        actorId: user.id,
        type: "DEPARTMENT_CHANGED",
        field: "department",
        oldValue: oldDepartment?.name ?? "No department",
        newValue: department?.name ?? "No department",
      });
    }
    if (tagsChanged) {
      await logTicketEvent(tx, {
        ticketId: ticket.id,
        actorId: user.id,
        type: "TAGS_CHANGED",
        field: "tagIds",
      });
    }
    if (changedFields.includes("title") || changedFields.includes("description")) {
      await logTicketEvent(tx, {
        ticketId: ticket.id,
        actorId: user.id,
        type: "DETAILS_CHANGED",
        metadata: { fields: changedFields },
      });
    }
  });

  revalidateTicket(ticket.publicId);
}

export async function addComment(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, ticket } = await loadTicketForMutation(ticketId);

  const wantsInternal = formData.get("isInternal") === "on";
  if (wantsInternal && !can(user.role, "comment:create:internal")) forbidden();
  if (!wantsInternal && !can(user.role, "comment:create:public")) forbidden();

  const parsed = addCommentSchema.safeParse({
    body: formData.get("body"),
    isInternal: wantsInternal,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  const isStaff = user.role !== "REQUESTER";

  await db.$transaction(async (tx) => {
    await tx.comment.create({
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
        // A public staff reply counts as the first response.
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
      metadata: { isInternal: parsed.data.isInternal },
    });
  });

  try {
    if (parsed.data.isInternal) {
      // Internal notes stay inside the team: tell the assignee, never the web.
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
      ticketPayload(ticket, `Reply by ${user.name}`),
    );
    }
  } catch (error) {
    console.error(`[tickets] notify failed for ${ticket.publicId}`, error);
  }

  revalidateTicket(ticket.publicId);
}

export async function submitCsat(
  ticketId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, ticket } = await loadTicketForMutation(ticketId);

  // Only the person who filed the ticket rates it.
  if (user.id !== ticket.requesterId) forbidden();
  if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") {
    return { error: "Only resolved tickets can be rated." };
  }
  if (ticket.csatScore !== null) {
    return { error: "You already rated this ticket." };
  }

  const parsed = submitCsatSchema.safeParse({
    score: formData.get("score"),
    comment: formData.get("comment"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid rating." };
  }

  await db.ticket.update({
    where: { id: ticket.id },
    data: { csatScore: parsed.data.score, csatComment: parsed.data.comment },
  });

  revalidateTicket(ticket.publicId);
}
