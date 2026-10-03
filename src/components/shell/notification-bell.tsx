import Link from "next/link";
import { Bell } from "lucide-react";
import { db } from "@/lib/db";

export async function NotificationBell({ userId }: { userId: string }) {
  const unread = await db.notification.count({ where: { userId, readAt: null } });

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative rounded p-2 text-muted transition hover:bg-sunken hover:text-ink"
    >
      <Bell size={16} strokeWidth={1.5} aria-hidden />
      {unread > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold tabular-nums text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
