import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/dal";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import type { Theme } from "@/app/layout";

const LINKS = [
  { label: "Tickets", href: "/tickets" },
  { label: "New ticket", href: "/tickets/new" },
  { label: "Knowledge base", href: "/kb" },
  { label: "Settings", href: "/settings" },
];

/** Requester portal: single centered column, no sidebar. */
export async function RequesterShell({
  theme,
  children,
}: {
  theme: Theme;
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[640px] items-center gap-4 px-4">
          <Link href="/tickets" className="text-sm font-semibold">
            Support Desk
          </Link>
          <nav className="flex flex-1 items-center gap-4" aria-label="Primary">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[13px] text-muted transition hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <NotificationBell userId={user.id} />
          <ThemeToggle initial={theme} />
          <form action={logout}>
            <button
              type="submit"
              className="rounded px-2 py-1 text-xs font-medium text-muted transition hover:bg-sunken hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[640px] flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
