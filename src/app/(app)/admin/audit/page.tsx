import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { EVENT_LABELS } from "@/lib/tickets/events";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { TicketEventType } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Audit log",
};

const PAGE_SIZE = 50;
const EVENT_TYPES = Object.keys(EVENT_LABELS) as TicketEventType[];

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function AuditPage({ searchParams }: Props) {
  await requirePermission("audit:view");

  const params = await searchParams;
  const publicId = first(params.ticket).trim();
  const type = first(params.type).trim();
  const actor = first(params.actor).trim();
  const page = Math.max(1, Number.parseInt(first(params.page) || "1", 10) || 1);

  const validType = (EVENT_TYPES as string[]).includes(type) ? (type as TicketEventType) : null;

  const where = {
    ...(publicId ? { ticket: { publicId: { contains: publicId, mode: "insensitive" as const } } } : {}),
    ...(validType ? { type: validType } : {}),
    ...(actor ? { actor: { email: { contains: actor, mode: "insensitive" as const } } } : {}),
  };

  const [total, events] = await Promise.all([
    db.ticketEvent.count({ where }),
    db.ticketEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        ticket: { select: { publicId: true, title: true } },
        actor: { select: { name: true, email: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) notFound();

  const pageLink = (target: number) => {
    const next = new URLSearchParams();
    if (publicId) next.set("ticket", publicId);
    if (type) next.set("type", type);
    if (actor) next.set("actor", actor);
    next.set("page", String(target));
    return `/admin/audit?${next.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Audit log</h1>
        <p className="mt-1 text-sm text-muted">
          {total} {total === 1 ? "event" : "events"} · who changed what, and when.
        </p>
      </div>

      <form
        method="get"
        action="/admin/audit"
        className="flex flex-wrap gap-2 rounded border border-line bg-surface p-4"
      >
        <input
          type="search"
          name="ticket"
          defaultValue={publicId}
          placeholder="Ticket ID, e.g. TK-000001"
          className="min-w-40 flex-1 rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none"
        />
        <select
          name="type"
          defaultValue={type}
          aria-label="Event type"
          className="rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none"
        >
          <option value="">All events</option>
          {EVENT_TYPES.map((eventType) => (
            <option key={eventType} value={eventType}>
              {EVENT_LABELS[eventType]}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="actor"
          defaultValue={actor}
          placeholder="Actor email"
          className="rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none"
        />
        <button
          type="submit"
          className="rounded bg-accent-fill px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          Filter
        </button>
        {publicId || type || actor ? (
          <Link
            href="/admin/audit"
            className="rounded border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-sunken"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {events.length === 0 ? (
        <p className="rounded border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          No events match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-line bg-surface">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-sunken text-xs text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Ticket</th>
                <th className="px-5 py-3 font-medium">Actor</th>
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-5 py-3 font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((event) => {
                const change =
                  event.oldValue || event.newValue
                    ? `${event.field ?? ""} ${event.oldValue ?? "—"} → ${event.newValue ?? "—"}`.trim()
                    : (event.metadata ? JSON.stringify(event.metadata).slice(0, 120) : "—");
                return (
                  <tr key={event.id} className="transition hover:bg-sunken">
                    <td
                      className="whitespace-nowrap px-5 py-3 text-muted"
                      title={formatDateTime(event.createdAt)}
                    >
                      {timeAgo(event.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <Link
                        href={`/tickets/${event.ticket.publicId}`}
                        className="tabular-nums text-xs font-medium text-ink hover:underline"
                      >
                        {event.ticket.publicId}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-muted">
                      {event.actor ? (
                        <span title={event.actor.email}>{event.actor.name}</span>
                      ) : (
                        <span className="text-faint">System</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-ink">
                      {EVENT_LABELS[event.type]}
                    </td>
                    <td className="max-w-md truncate px-5 py-3 text-muted" title={change}>
                      {change}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={pageLink(page - 1)}
                className="rounded border border-line bg-surface px-3 py-1.5 font-medium text-ink transition hover:bg-sunken"
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={pageLink(page + 1)}
                className="rounded border border-line bg-surface px-3 py-1.5 font-medium text-ink transition hover:bg-sunken"
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
