import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { getCurrentUser, requireUser } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { canAccessTicket } from "@/lib/tickets/access";
import { allowedTransitions } from "@/lib/tickets/transitions";
import { EVENT_LABELS, isTimelineEvent } from "@/lib/tickets/events";
import { formatDateTime, formatFileSize, timeAgo } from "@/lib/format";
import { maxUploadBytes } from "@/lib/attachments";
import { PriorityMark, SeverityMark, SlaClock, StatusBadge, clockTone } from "@/components/tickets/badges";
import { readDeadline } from "@/lib/sla/state";
import { listCannedForTicket } from "@/app/(app)/canned/actions";
import {
  PRIORITY_LABELS,
  SEVERITY_LABELS,
  STATUS_LABELS,
} from "@/lib/labels";
import { StatusControl } from "./status-control";
import { PriorityControl, SeverityControl } from "./priority-severity-controls";
import { AssignForm } from "./assign-form";
import { EditDetailsForm } from "./edit-details-form";
import { CommentComposer } from "./comment-composer";
import { AttachmentUpload } from "./attachment-upload";
import { CsatSurvey } from "./csat-survey";

type Props = {
  params: Promise<{ publicId: string }>;
};

function changeLabel(field: string | null, oldValue: string | null, newValue: string | null) {
  if (field === "status" && oldValue && newValue) {
    return `${STATUS_LABELS[oldValue as keyof typeof STATUS_LABELS] ?? oldValue} → ${STATUS_LABELS[newValue as keyof typeof STATUS_LABELS] ?? newValue}`;
  }
  if (field === "priority" && oldValue && newValue) {
    return `${PRIORITY_LABELS[oldValue as keyof typeof PRIORITY_LABELS] ?? oldValue} → ${PRIORITY_LABELS[newValue as keyof typeof PRIORITY_LABELS] ?? newValue}`;
  }
  if (field === "severity" && oldValue && newValue) {
    return `${SEVERITY_LABELS[oldValue as keyof typeof SEVERITY_LABELS] ?? oldValue} → ${SEVERITY_LABELS[newValue as keyof typeof SEVERITY_LABELS] ?? newValue}`;
  }
  if (oldValue && newValue && oldValue !== newValue) {
    return `${oldValue} → ${newValue}`;
  }
  return newValue ?? oldValue ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicId } = await params;
  const user = await getCurrentUser();
  const ticket = user
    ? await db.ticket.findUnique({
        where: { publicId },
        select: { publicId: true, title: true, requesterId: true },
      })
    : null;

  if (!ticket || !user || !canAccessTicket(user, ticket.requesterId)) {
    return { title: "Ticket" };
  }
  return { title: `${ticket.publicId} · ${ticket.title}` };
}

export default async function TicketDetailPage({ params }: Props) {
  const { publicId } = await params;
  const user = await requireUser();
  const isStaff = user.role !== "REQUESTER";

  const ticket = await db.ticket.findUnique({
    where: { publicId },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
      comments: {
        where: isStaff ? {} : { isInternal: false },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, role: true } } },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
        include: { uploader: { select: { name: true } } },
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { actor: { select: { name: true } } },
      },
    },
  });

  if (!ticket) notFound();
  if (!canAccessTicket(user, ticket.requesterId)) notFound();

  const canEdit = can(user.role, "ticket:update");
  const canAssign = can(user.role, "ticket:assign");
  const canCommentInternal = can(user.role, "comment:create:internal");

  const statusOptions = canEdit
    ? allowedTransitions(ticket.status).filter((status) => {
        if (status === "CLOSED") return can(user.role, "ticket:close");
        if (status === "REOPENED") return can(user.role, "ticket:reopen");
        return true;
      })
    : [];

  const [teams, staffMembers, categories, departments, tags] = await Promise.all([
    canAssign
      ? db.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    canAssign
      ? db.user.findMany({
          where: { role: { in: ["ADMIN", "MANAGER", "AGENT"] }, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canEdit
      ? db.category.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canEdit
      ? db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    canEdit
      ? db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);

  const timeline = ticket.events.filter((event) => isTimelineEvent(event.type));

  const canned = isStaff ? await listCannedForTicket(ticket.categoryId) : [];

  const paused =
    ticket.status === "WAITING_ON_CUSTOMER" && !ticket.resolvedAt && !ticket.closedAt;
  const responseClock = readDeadline({
    dueAt: ticket.dueResponseAt,
    from: ticket.createdAt,
    doneAt: ticket.firstRespondedAt,
  });
  const resolutionClock = readDeadline({
    dueAt: ticket.dueResolutionAt,
    from: ticket.createdAt,
    doneAt: ticket.resolvedAt ?? ticket.closedAt,
  });

  const metaRows: Array<{ label: string; value: React.ReactNode }> = [
    { label: "Requester", value: `${ticket.requester.name} · ${ticket.requester.email}` },
    { label: "Assignee", value: ticket.assignee?.name ?? "Unassigned" },
    { label: "Team", value: ticket.team?.name ?? "—" },
    { label: "Department", value: ticket.department?.name ?? "—" },
    { label: "Category", value: ticket.category?.name ?? "Uncategorized" },
    {
      label: "Tags",
      value:
        ticket.tags.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {ticket.tags.map(({ tag }) => (
              <span
                key={tag.id}
                className="rounded border border-line bg-sunken px-1.5 py-px text-xs text-muted"
              >
                {tag.name}
              </span>
            ))}
          </span>
        ) : (
          "—"
        ),
    },
    { label: "Severity", value: <SeverityMark severity={ticket.severity} /> },
    { label: "Created", value: formatDateTime(ticket.createdAt) },
    { label: "Updated", value: `${timeAgo(ticket.updatedAt)} (${formatDateTime(ticket.updatedAt)})` },
  ];
  if (ticket.firstRespondedAt) {
    metaRows.push({ label: "First response", value: formatDateTime(ticket.firstRespondedAt) });
  }
  if (ticket.resolvedAt) {
    metaRows.push({ label: "Resolved", value: formatDateTime(ticket.resolvedAt) });
  }
  if (ticket.closedAt) {
    metaRows.push({ label: "Closed", value: formatDateTime(ticket.closedAt) });
  }
  if (ticket.csatScore !== null) {
    metaRows.push({
      label: "Satisfaction",
      value: `${ticket.csatScore}/5${ticket.csatComment ? ` — “${ticket.csatComment}”` : ""}`,
    });
  }
  if (ticket.reopenedAt) {
    metaRows.push({ label: "Reopened", value: formatDateTime(ticket.reopenedAt) });
  }

  const showCsat =
    user.id === ticket.requesterId &&
    (ticket.status === "RESOLVED" || ticket.status === "CLOSED");

  return (
    <div className="space-y-5">
      <Link href="/tickets" className="text-[13px] text-muted transition hover:text-ink">
        Back to tickets
      </Link>

      <div>
        <p className="text-xs tabular-nums text-faint">{ticket.publicId}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-[18px] font-semibold leading-[26px]">{ticket.title}</h1>
          <StatusBadge status={ticket.status} />
          <PriorityMark priority={ticket.priority} />
        </div>
        <div className="mt-3 grid gap-2 border-y border-line py-3 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-faint">First response</span>
            <SlaClock
              tone={clockTone(responseClock.state)}
              text={responseClock.text}
              consumed={responseClock.consumed}
              title={ticket.dueResponseAt ? formatDateTime(ticket.dueResponseAt) : undefined}
              wide
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-faint">Resolution</span>
            <SlaClock
              tone={clockTone(resolutionClock.state)}
              text={paused ? "Paused" : resolutionClock.text}
              consumed={resolutionClock.consumed}
              title={ticket.dueResolutionAt ? formatDateTime(ticket.dueResolutionAt) : undefined}
              paused={paused}
              wide
            />
          </div>
        </div>
        {ticket.escalationLevel > 0 ? (
          <p className="mt-2 text-xs text-faint">
            Escalated {ticket.escalationLevel} {ticket.escalationLevel === 1 ? "time" : "times"}
            {ticket.lastEscalatedAt ? ` · last ${timeAgo(ticket.lastEscalatedAt)}` : ""}
          </p>
        ) : null}
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_250px]">
        <div className="min-w-0 space-y-8">
          {showCsat ? (
            ticket.csatScore === null ? (
              <CsatSurvey ticketId={ticket.id} />
            ) : (
              <p className="rounded border border-line bg-sunken px-4 py-3 text-sm">
                You rated this ticket {ticket.csatScore}/5. Thank you for the feedback.
              </p>
            )
          ) : null}

          <section aria-labelledby="description">
            <h2 id="description" className="text-sm font-semibold">
              Description
            </h2>
            <p className="mt-2 max-w-[72ch] whitespace-pre-wrap text-sm leading-[22px]">
              {ticket.description}
            </p>
          </section>

          {canEdit ? (
            <EditDetailsForm
              ticketId={ticket.id}
              current={{
                title: ticket.title,
                description: ticket.description,
                categoryId: ticket.categoryId,
                departmentId: ticket.departmentId,
                tagIds: ticket.tags.map(({ tag }) => tag.id),
              }}
              categories={categories}
              departments={departments}
              tags={tags}
            />
          ) : null}

          <section aria-labelledby="replies">
            <h2 id="replies" className="text-sm font-semibold">
              Replies ({ticket.comments.length})
            </h2>

            {ticket.comments.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No replies yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {ticket.comments.map((comment) => (
                  <li key={comment.id} className="py-4">
                    {comment.isInternal ? (
                      <div className="rounded bg-sunken p-4">
                        <p className="flex items-center gap-1.5 text-xs font-medium">
                          <Lock size={14} strokeWidth={1.5} aria-hidden />
                          Internal note, not visible to requester
                        </p>
                        <p className="mt-2 max-w-[72ch] whitespace-pre-wrap text-sm leading-[22px]">
                          {comment.body}
                        </p>
                        <p className="mt-2 text-xs text-faint">
                          {comment.author.name} ·{" "}
                          <span title={formatDateTime(comment.createdAt)}>
                            {timeAgo(comment.createdAt)}
                          </span>
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="max-w-[72ch] whitespace-pre-wrap text-sm leading-[22px]">
                          {comment.body}
                        </p>
                        <p className="mt-2 text-xs text-faint">
                          <span className="font-medium text-muted">{comment.author.name}</span> ·{" "}
                          <span title={formatDateTime(comment.createdAt)}>
                            {timeAgo(comment.createdAt)}
                          </span>
                        </p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4">
              <CommentComposer
                ticketId={ticket.id}
                canWriteInternal={canCommentInternal}
                requesterName={ticket.requester.name}
                canned={canned}
              />
            </div>
          </section>

          <section aria-labelledby="attachments">
            <h2 id="attachments" className="text-sm font-semibold">
              Attachments ({ticket.attachments.length})
            </h2>

            {ticket.attachments.length > 0 ? (
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {ticket.attachments.map((attachment) => (
                  <li key={attachment.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{attachment.filename}</p>
                      <p className="text-xs tabular-nums text-faint">
                        {formatFileSize(attachment.size)} · {attachment.uploader.name} ·{" "}
                        {timeAgo(attachment.createdAt)}
                      </p>
                    </div>
                    <a
                      href={`/api/attachments/${attachment.id}`}
                      className="shrink-0 rounded border border-line px-2.5 py-1 text-xs font-medium transition hover:bg-sunken"
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">No files attached yet.</p>
            )}

            <div className="mt-3">
              <AttachmentUpload ticketId={ticket.id} maxBytes={maxUploadBytes()} />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          {canEdit && statusOptions.length > 0 ? (
            <section aria-label="Change status">
              <StatusControl ticketId={ticket.id} current={ticket.status} options={statusOptions} />
            </section>
          ) : null}

          {canEdit ? (
            <section aria-label="Priority and severity" className="space-y-4">
              <PriorityControl ticketId={ticket.id} current={ticket.priority} />
              <SeverityControl ticketId={ticket.id} current={ticket.severity} />
            </section>
          ) : null}

          {canAssign ? (
            <section aria-label="Assignment">
              <AssignForm
                ticketId={ticket.id}
                currentAssigneeId={ticket.assigneeId}
                currentTeamId={ticket.teamId}
                teams={teams}
                staff={staffMembers}
              />
            </section>
          ) : null}

          <section aria-labelledby="details">
            <h2 id="details" className="text-sm font-semibold">
              Details
            </h2>
            <dl className="mt-2 divide-y divide-line border-y border-line">
              {metaRows.map((row) => (
                <div key={row.label} className="grid grid-cols-3 gap-2 py-2">
                  <dt className="text-xs text-faint">{row.label}</dt>
                  <dd className="col-span-2 text-[13px]">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="activity">
            <h2 id="activity" className="text-sm font-semibold">
              Activity
            </h2>
            {timeline.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">No activity recorded yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {timeline.map((event) => {
                  const change = changeLabel(event.field, event.oldValue, event.newValue);
                  return (
                    <li key={event.id} className="py-2">
                      <p className="text-[13px]">
                        <span className="font-medium">
                          {event.actor?.name ?? "System"}
                        </span>{" "}
                        {EVENT_LABELS[event.type]}
                        {change ? <span className="text-muted"> ({change})</span> : null}
                      </p>
                      <p className="mt-0.5 text-xs tabular-nums text-faint" title={formatDateTime(event.createdAt)}>
                        {timeAgo(event.createdAt)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
