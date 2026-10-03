"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BookOpen,
  ChartColumn,
  Clock,
  Inbox,
  KeyRound,
  Layers,
  LogOut,
  MessageSquareQuote,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ScrollText,
  Settings,
  Tags,
  Ticket,
  TriangleAlert,
  UserCog,
  UserX,
  Users,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { can, type Permission } from "@/lib/rbac";
import { ROLE_LABELS } from "@/lib/labels";
import { deleteFilterView } from "@/app/(app)/tickets/saved-views";
import { ThemeToggle } from "./theme-toggle";
import type { Theme } from "@/app/layout";
import type { Role } from "@/generated/prisma/enums";

type ShellUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string | null;
};

type Entry = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  count?: number;
  permissions?: Permission[];
};

function EntryLink({ entry, collapsed }: { entry: Entry; collapsed: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [urlPath, urlQuery] = entry.href.split("?");
  const active =
    pathname === urlPath &&
    (urlQuery === undefined || searchParams.toString() === urlQuery);

  return (
    <Link
      href={entry.href}
      title={entry.label}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded px-2.5 py-[7px] text-[13px] leading-[18px] transition ${
        collapsed ? "justify-center px-0" : ""
      } ${
        active
          ? "bg-accent-soft font-medium text-ink shadow-[inset_2px_0_0_var(--accent)]"
          : "text-muted hover:bg-sunken hover:text-ink"
      }`}
    >
      <entry.icon size={16} strokeWidth={1.5} className="shrink-0" aria-hidden />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{entry.label}</span>}
      {!collapsed && entry.count !== undefined ? (
        <span className="shrink-0 text-xs tabular-nums text-faint">{entry.count}</span>
      ) : null}
    </Link>
  );
}

function Section({
  title,
  entries,
  role,
  collapsed,
}: {
  title?: string;
  entries: Entry[];
  role: Role;
  collapsed: boolean;
}) {
  const visible = entries.filter(
    (entry) =>
      !entry.permissions || entry.permissions.some((permission) => can(role, permission)),
  );
  if (visible.length === 0) return null;
  return (
    <div>
      {title && !collapsed ? (
        <p className="px-2.5 pb-1 text-xs text-faint">{title}</p>
      ) : null}
      <nav className="flex flex-col gap-px" aria-label={title ?? "Primary"}>
        {visible.map((entry) => (
          <EntryLink key={entry.key} entry={entry} collapsed={collapsed} />
        ))}
      </nav>
    </div>
  );
}

export function StaffShell({
  user,
  theme,
  counts,
  views,
  children,
}: {
  user: ShellUser;
  theme: Theme;
  counts: { mine: number; unassigned: number; atRisk: number; open: number };
  views: Array<{ id: string; name: string; query: Record<string, string> }>;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const viewEntries: Entry[] = [
    { key: "mine", label: "Mine", href: `/tickets?assignee=${user.id}`, icon: Inbox, count: counts.mine },
    { key: "unassigned", label: "Unassigned", href: "/tickets?unassigned=1", icon: UserX, count: counts.unassigned },
    { key: "atrisk", label: "At risk", href: "/tickets?atrisk=1", icon: TriangleAlert, count: counts.atRisk },
    { key: "open", label: "All open", href: "/tickets", icon: Layers, count: counts.open },
  ];

  const workspace: Entry[] = [
    { key: "tickets", label: "Tickets", href: "/tickets", icon: Ticket },
    { key: "new", label: "New ticket", href: "/tickets/new", icon: Plus, permissions: ["ticket:create"] },
    { key: "kb", label: "Knowledge base", href: "/kb", icon: BookOpen, permissions: ["kb:read"] },
    { key: "reports", label: "Reports", href: "/reports", icon: ChartColumn, permissions: ["report:view"] },
    { key: "canned", label: "Canned replies", href: "/canned", icon: MessageSquareQuote, permissions: ["canned:manage"] },
  ];

  const manage: Entry[] = [
    { key: "categories", label: "Categories", href: "/admin/categories", icon: Tags, permissions: ["category:manage"] },
    { key: "sla", label: "SLA policies", href: "/admin/sla", icon: Clock, permissions: ["sla:manage"] },
    { key: "automation", label: "Automation", href: "/admin/automation", icon: Zap, permissions: ["automation:manage"] },
    { key: "webhooks", label: "Webhooks", href: "/admin/webhooks", icon: Webhook, permissions: ["webhook:manage"] },
    { key: "apikeys", label: "API keys", href: "/admin/api-keys", icon: KeyRound, permissions: ["api:manage"] },
    { key: "audit", label: "Audit log", href: "/admin/audit", icon: ScrollText, permissions: ["audit:view"] },
    { key: "team", label: "Team", href: "/team", icon: Users, permissions: ["team:manage", "user:manage"] },
    { key: "users", label: "Users", href: "/admin/users", icon: UserCog, permissions: ["user:manage"] },
  ];

  return (
    <div className="flex min-h-screen">
      <aside
        className={`flex shrink-0 flex-col border-r border-line bg-surface transition-[width] ${
          collapsed ? "w-14" : "w-[220px]"
        }`}
      >
        <div
          className={`flex h-14 items-center gap-2 border-b border-line px-3 ${collapsed ? "justify-center px-0" : ""}`}
        >
          {!collapsed && <span className="min-w-0 flex-1 truncate text-sm font-semibold">Support Desk</span>}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded p-1.5 text-muted transition hover:bg-sunken hover:text-ink"
          >
            {collapsed ? (
              <PanelLeftOpen size={16} strokeWidth={1.5} />
            ) : (
              <PanelLeftClose size={16} strokeWidth={1.5} />
            )}
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-3">
          <Suspense>
            <Section title="Views" entries={viewEntries} role={user.role} collapsed={collapsed} />
          </Suspense>

          {views.length > 0 && !collapsed ? (
            <div>
              <p className="px-2.5 pb-1 text-xs text-faint">Saved views</p>
              <ul className="flex flex-col gap-px">
                {views.map((view) => (
                  <li
                    key={view.id}
                    className="group flex items-center gap-1 rounded px-2.5 py-[7px] text-[13px] leading-[18px] text-muted transition hover:bg-sunken hover:text-ink"
                  >
                    <Link
                      href={`/tickets?${new URLSearchParams(view.query).toString()}`}
                      title={view.name}
                      className="min-w-0 flex-1 truncate"
                    >
                      {view.name}
                    </Link>
                    <form action={deleteFilterView}>
                      <input type="hidden" name="id" value={view.id} />
                      <button
                        type="submit"
                        title={`Delete view ${view.name}`}
                        aria-label={`Delete view ${view.name}`}
                        className="rounded px-1 text-faint opacity-0 transition group-hover:opacity-100 hover:text-ink"
                      >
                        ×
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Suspense>
            <Section title="Workspace" entries={workspace} role={user.role} collapsed={collapsed} />
          </Suspense>
          <Suspense>
            <Section title="Manage" entries={manage} role={user.role} collapsed={collapsed} />
          </Suspense>

          <Suspense>
            <Section
              title="Personal"
              entries={[
                { key: "settings", label: "Settings", href: "/settings", icon: Settings },
              ]}
              role={user.role}
              collapsed={collapsed}
            />
          </Suspense>
        </div>

        <div className="border-t border-line px-3 py-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-1">
              <ThemeToggle initial={theme} />
              <form action={logout}>
                <button
                  type="submit"
                  title="Sign out"
                  aria-label="Sign out"
                  className="rounded p-2 text-muted transition hover:bg-sunken hover:text-ink"
                >
                  <LogOut size={16} strokeWidth={1.5} />
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-[18px]">{user.name}</p>
                <p className="truncate text-xs text-faint">
                  {user.jobTitle ?? ROLE_LABELS[user.role]}
                </p>
              </div>
              <ThemeToggle initial={theme} />
              <form action={logout}>
                <button
                  type="submit"
                  title="Sign out"
                  className="rounded px-2 py-1 text-xs font-medium text-muted transition hover:bg-sunken hover:text-ink"
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
