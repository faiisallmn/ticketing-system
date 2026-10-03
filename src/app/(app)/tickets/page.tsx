import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { formatDateTime, timeAgo } from "@/lib/format";
import { PriorityMark, SlaClock, StatusBadge, clockTone } from "@/components/tickets/badges";
import { readDeadline } from "@/lib/sla/state";
import { searchTicketIds } from "@/lib/tickets/search";
import { deleteFilterView } from "./saved-views";
import { SaveViewForm } from "./save-view-form";
import { QueueControls } from "./queue-controls";

export const metadata: Metadata = {
  title: "Tickets",
};

const PAGE_SIZE = 25;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parseDate(value: string, endOfDay: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const inputClass =
  "h-8 rounded border border-line bg-surface px-2.5 text-[13px] text-ink outline-none placeholder:text-faint";

type ClockTicket = {
  status: string;
  dueResponseAt: Date | null;
  dueResolutionAt: Date | null;
  createdAt: Date;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
};

/** Worst outstanding deadline for the queue's SLA column. */
function worstClock(ticket: ClockTicket) {
  const response = readDeadline({
    dueAt: ticket.dueResponseAt,
    from: ticket.createdAt,
    doneAt: ticket.firstRespondedAt,
  });
  const resolution = readDeadline({
    dueAt: ticket.dueResolutionAt,
    from: ticket.createdAt,
    doneAt: ticket.resolvedAt ?? ticket.closedAt,
  });
  const rank = (state: string) =>
    state === "breached" ? 0 : state === "due-soon" ? 1 : state === "ok" ? 2 : 3;
  const chosen = rank(response.state) <= rank(resolution.state) ? response : resolution;
  const paused =
    ticket.status === "WAITING_ON_CUSTOMER" &&
    chosen === resolution &&
    !ticket.resolvedAt &&
    !ticket.closedAt;
  return { ...chosen, paused };
}

export default async function TicketsPage({ searchParams }: Props) {
  const user = await requireUser();
  const isStaff = user.role !== "REQUESTER";

  const params = await searchParams;
  const q = first(params.q).trim();
  const status = first(params.status);
  const priority = first(params.priority);
  const assignee = first(params.assignee);
  const unassigned = first(params.unassigned) === "1";
  const team = first(params.team);
  const category = first(params.category);
  const tag = first(params.tag);
  const department = first(params.department);
  const atRisk = first(params.atrisk) === "1";
  const from = parseDate(first(params.from), false);
  const to = parseDate(first(params.to), true);
  const page = Math.max(1, Number.parseInt(first(params.page) || "1", 10) || 1);

  const filtersActive =
    q !== "" ||
    status !== "" ||
    priority !== "" ||
    assignee !== "" ||
    unassigned ||
    team !== "" ||
    category !== "" ||
    tag !== "" ||
    department !== "" ||
    atRisk ||
    from !== null ||
    to !== null;

  const { ids, total } = await searchTicketIds(
    user,
    {
      q,
      status: status || null,
      priority: priority || null,
      assigneeId: assignee || null,
      unassigned,
      teamId: team || null,
      categoryId: category || null,
      tagId: tag || null,
      departmentId: department || null,
      atRisk,
      from,
      to,
    },
    page,
    PAGE_SIZE,
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) notFound();

  const rows = await db.ticket.findMany({
    where: { id: { in: ids } },
    include: {
      requester: { select: { name: true } },
      assignee: { select: { name: true } },
      category: { select: { name: true } },
    },
  });
  const byId = new Map(rows.map((ticket) => [ticket.id, ticket]));
  const tickets = ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));

  const [staff, teams, categories, tags, departments, views] = await Promise.all([
    isStaff
      ? db.user.findMany({
          where: { role: { in: ["ADMIN", "MANAGER", "AGENT"] }, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    isStaff
      ? db.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    db.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    isStaff
      ? db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    db.savedFilter.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, query: true },
    }),
  ]);

  const baseParams = new URLSearchParams();
  const setParam = (key: string, value: string) => {
    if (value !== "") baseParams.set(key, value);
  };
  setParam("q", q);
  setParam("status", status);
  setParam("priority", priority);
  if (isStaff) {
    setParam("assignee", assignee);
    if (unassigned) baseParams.set("unassigned", "1");
    setParam("team", team);
    setParam("department", department);
  }
  setParam("category", category);
  setParam("tag", tag);
  if (atRisk) baseParams.set("atrisk", "1");
  if (from) baseParams.set("from", first(params.from));
  if (to) baseParams.set("to", first(params.to));
  const pageLink = (target: number) => {
    const next = new URLSearchParams(baseParams);
    next.set("page", String(target));
    return `/tickets?${next.toString()}`;
  };

  const canCreate = can(user.role, "ticket:create");
  const heading = isStaff ? "Tickets" : "My tickets";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold leading-[28px]">{heading}</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {total} {total === 1 ? "ticket" : "tickets"}
            {filtersActive ? " matching filters" : ""}
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/tickets/new"
            className="rounded bg-accent-fill px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            New ticket
          </Link>
        ) : null}
      </div>

      <form method="get" action="/tickets" className="space-y-2 rounded bg-sunken p-3">
        <div className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search title, description, replies…"
            aria-label="Search tickets"
            className={`${inputClass} h-9 min-w-0 flex-1`}
          />
          <button
            type="submit"
            className="h-9 shrink-0 rounded bg-accent-fill px-4 text-sm font-medium text-white transition hover:opacity-90"
          >
            Search
          </button>
          {filtersActive ? (
            <Link
              href="/tickets"
              className="flex h-9 shrink-0 items-center rounded border border-line bg-surface px-3 text-sm text-muted transition hover:text-ink"
            >
              Clear
            </Link>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <select name="status" defaultValue={status} className={inputClass} aria-label="Status">
            <option value="">Any status</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="WAITING_ON_CUSTOMER">Waiting on Customer</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
            <option value="REOPENED">Reopened</option>
          </select>

          <select name="priority" defaultValue={priority} className={inputClass} aria-label="Priority">
            <option value="">Any priority</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>

          {isStaff ? (
            <>
              <select name="assignee" defaultValue={assignee} className={inputClass} aria-label="Assignee">
                <option value="">Any assignee</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              <select name="team" defaultValue={team} className={inputClass} aria-label="Team">
                <option value="">Any team</option>
                {teams.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                name="department"
                defaultValue={department}
                className={inputClass}
                aria-label="Department"
              >
                <option value="">Any department</option>
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          <select name="category" defaultValue={category} className={inputClass} aria-label="Category">
            <option value="">Any category</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <select name="tag" defaultValue={tag} className={inputClass} aria-label="Tag">
            <option value="">Any tag</option>
            {tags.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            name="from"
            defaultValue={first(params.from)}
            aria-label="Created from"
            className={inputClass}
          />
          <input
            type="date"
            name="to"
            defaultValue={first(params.to)}
            aria-label="Created until"
            className={inputClass}
          />

          <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded border border-line bg-surface px-2.5 text-[13px] text-muted transition has-checked:border-warn has-checked:text-ink">
            <input
              type="checkbox"
              name="atrisk"
              value="1"
              defaultChecked={atRisk}
              className="h-3.5 w-3.5 accent-warn"
            />
            At risk
          </label>

          {isStaff ? (
            <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded border border-line bg-surface px-2.5 text-[13px] text-muted transition has-checked:border-accent has-checked:text-ink">
              <input
                type="checkbox"
                name="unassigned"
                value="1"
                defaultChecked={unassigned}
                className="h-3.5 w-3.5 accent-accent"
              />
              Unassigned
            </label>
          ) : null}
        </div>
      </form>

      {views.length > 0 || filtersActive ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-faint">Views</span>
          {views.map((view) => (
            <span
              key={view.id}
              className="flex items-center gap-1 rounded border border-line bg-surface py-0.5 pl-3 pr-1 text-xs text-ink"
            >
              <Link
                href={`/tickets?${new URLSearchParams(view.query as Record<string, string>).toString()}`}
                className="hover:underline"
              >
                {view.name}
              </Link>
              <form action={deleteFilterView}>
                <input type="hidden" name="id" value={view.id} />
                <button
                  type="submit"
                  title={`Delete view ${view.name}`}
                  aria-label={`Delete view ${view.name}`}
                  className="rounded px-1.5 text-faint transition hover:text-ink"
                >
                  ×
                </button>
              </form>
            </span>
          ))}
          {filtersActive ? <SaveViewForm current={Object.fromEntries(baseParams)} /> : null}
        </div>
      ) : null}

      {tickets.length === 0 ? (
        <div className="rounded border border-dashed border-line px-6 py-16 text-center">
          <p className="text-sm font-medium">No tickets in this view</p>
          <p className="mt-1 text-[13px] text-muted">
            {filtersActive
              ? "Clear the filters or create a ticket."
              : isStaff
                ? "Tickets submitted by requesters will show up here."
                : "When you submit a ticket it will show up here."}
          </p>
          {canCreate && !filtersActive ? (
            <Link
              href="/tickets/new"
              className="mt-4 inline-block rounded bg-accent-fill px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Create the first ticket
            </Link>
          ) : null}
        </div>
      ) : isStaff ? (
        <div className="space-y-2">
          <QueueControls ids={tickets.map((ticket) => ticket.publicId)} />
          <div className="overflow-x-auto border border-line bg-surface">
            <table data-queue-table className="w-full min-w-[880px] text-left">
              <thead className="sticky top-0 bg-surface text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Subject</th>
                  <th className="px-3 py-2 text-left font-medium">Requester</th>
                  <th className="px-3 py-2 text-left font-medium">Priority</th>
                  <th className="px-3 py-2 text-left font-medium">Assignee</th>
                  <th className="px-3 py-2 text-left font-medium">SLA</th>
                  <th className="px-3 py-2 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const clock = worstClock(ticket);
                  return (
                    <tr
                      key={ticket.id}
                      data-ticket-row={ticket.publicId}
                      className="h-9 border-b border-line transition last:border-b-0 hover:bg-sunken"
                    >
                      <td className="whitespace-nowrap px-3">
                        <StatusBadge status={ticket.status} />
                      </td>
                      <td className="whitespace-nowrap px-3">
                        <Link
                          href={`/tickets/${ticket.publicId}`}
                          className="text-xs tabular-nums text-muted hover:text-ink hover:underline"
                        >
                          {ticket.publicId}
                        </Link>
                      </td>
                      <td className="max-w-xs px-3">
                        <Link
                          href={`/tickets/${ticket.publicId}`}
                          className="block truncate text-[13px] font-medium hover:underline"
                          title={ticket.title}
                        >
                          {ticket.title}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 text-[13px] text-muted">
                        {ticket.requester.name}
                      </td>
                      <td className="whitespace-nowrap px-3">
                        <PriorityMark priority={ticket.priority} />
                      </td>
                      <td className="whitespace-nowrap px-3 text-[13px] text-muted">
                        {ticket.assignee?.name ?? "Unassigned"}
                      </td>
                      <td className="whitespace-nowrap px-3">
                        {clock.state === "off" ? (
                          <span className="text-xs text-faint">—</span>
                        ) : (
                          <SlaClock
                            tone={clockTone(clock.state)}
                            text={clock.paused ? "Paused" : clock.text}
                            consumed={clock.consumed}
                            paused={clock.paused}
                          />
                        )}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 text-xs tabular-nums text-muted"
                        title={formatDateTime(ticket.updatedAt)}
                      >
                        {timeAgo(ticket.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {tickets.map((ticket) => {
            const clock = worstClock(ticket);
            return (
              <li key={ticket.id} data-ticket-row={ticket.publicId} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/tickets/${ticket.publicId}`}
                    className="text-xs tabular-nums text-muted hover:text-ink"
                  >
                    {ticket.publicId}
                  </Link>
                  <StatusBadge status={ticket.status} />
                </div>
                <Link
                  href={`/tickets/${ticket.publicId}`}
                  className="mt-0.5 block text-sm font-medium hover:underline"
                >
                  {ticket.title}
                </Link>
                <p className="mt-0.5 text-xs text-muted">
                  {ticket.category?.name ?? "Uncategorized"} · Updated {timeAgo(ticket.updatedAt)}
                  {clock.state !== "off" && !clock.paused ? ` · ${clock.text}` : ""}
                  {clock.paused ? " · Paused" : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-[13px] text-muted">
          <span className="tabular-nums">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={pageLink(page - 1)}
                className="rounded border border-line bg-surface px-3 py-1.5 text-ink transition hover:bg-sunken"
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={pageLink(page + 1)}
                className="rounded border border-line bg-surface px-3 py-1.5 text-ink transition hover:bg-sunken"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
