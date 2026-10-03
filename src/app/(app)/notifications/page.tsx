import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { NOTIFICATION_LABELS } from "@/lib/labels";
import { timeAgo } from "@/lib/format";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export const metadata: Metadata = {
  title: "Notifications",
};

export default async function NotificationsPage() {
  const user = await requireUser();

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { ticket: { select: { publicId: true } } },
  });

  const unreadCount = notifications.filter((item) => !item.readAt).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Notifications</h1>
          <p className="mt-1 text-sm text-muted">
            {unreadCount === 0 ? "You're all caught up." : `${unreadCount} unread`}
          </p>
        </div>
        {unreadCount > 0 ? (
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="rounded border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-sunken"
            >
              Mark all read
            </button>
          </form>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="text-sm font-medium text-ink">No notifications yet</p>
          <p className="mt-1 text-sm text-muted">
            Assignments, replies and SLA alerts will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((item) => (
            <li
              key={item.id}
              className={`flex items-start justify-between gap-3 rounded border p-4 ${
                item.readAt ? "border-line bg-surface" : "border-line bg-accent-soft/50"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-muted">
                    {NOTIFICATION_LABELS[item.type]}
                  </span>
                  <span className="text-xs text-muted" title={item.createdAt.toISOString()}>
                    {timeAgo(item.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium text-ink">{item.title}</p>
                {item.body ? (
                  <p className="mt-0.5 truncate text-sm text-muted">{item.body}</p>
                ) : null}
                {item.ticket ? (
                  <Link
                    href={`/tickets/${item.ticket.publicId}`}
                    className="mt-1.5 inline-block tabular-nums text-xs font-medium text-ink hover:underline"
                  >
                    {item.ticket.publicId}
                  </Link>
                ) : null}
              </div>
              {!item.readAt ? (
                <form action={markNotificationRead} className="shrink-0">
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className="rounded border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sunken"
                  >
                    Mark read
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
