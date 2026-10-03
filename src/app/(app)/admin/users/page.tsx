import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { RoleBadge } from "@/components/tickets/badges";
import { formatDateTime, timeAgo } from "@/lib/format";

export const metadata: Metadata = {
  title: "Users",
};

export default async function UsersPage() {
  await requirePermission("user:manage");

  const users = await db.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      department: { select: { name: true } },
      team: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Users</h1>
          <p className="mt-1 text-sm text-muted">
            {users.length} {users.length === 1 ? "account" : "accounts"}
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="rounded bg-accent-fill px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          New user
        </Link>
      </div>

      <div className="overflow-x-auto rounded border border-line bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-sunken text-xs text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Team</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Last login</th>
              <th className="px-5 py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((user) => (
              <tr key={user.id} className="transition hover:bg-sunken">
                <td className="px-5 py-3">
                  <p className="font-medium text-ink">{user.name}</p>
                  <p className="text-xs text-muted">{user.email}</p>
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <RoleBadge role={user.role} />
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-muted">
                  {user.team?.name ?? user.department?.name ?? "—"}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  {user.isActive ? (
                    <span className="text-muted">Active</span>
                  ) : (
                    <span className="rounded-full border border-line bg-sunken px-2 py-0.5 text-xs font-medium text-muted">
                      Disabled
                    </span>
                  )}
                </td>
                <td
                  className="whitespace-nowrap px-5 py-3 text-muted"
                  title={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : undefined}
                >
                  {user.lastLoginAt ? timeAgo(user.lastLoginAt) : "Never"}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="rounded border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sunken"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
