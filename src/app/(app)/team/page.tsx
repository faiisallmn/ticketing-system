import type { Metadata } from "next";
import { requireAnyPermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { RoleBadge } from "@/components/tickets/badges";

export const metadata: Metadata = {
  title: "Team",
};

export default async function TeamPage() {
  await requireAnyPermission("team:manage", "user:manage");

  const [departments, teams, users] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.team.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { users: true } } },
    }),
    db.user.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        department: { select: { name: true } },
        team: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Team</h1>
        <p className="mt-1 text-sm text-muted">
          Departments, teams and everyone with access to the desk.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Departments</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((department) => {
            const departmentTeams = teams.filter((team) => team.departmentId === department.id);
            const memberCount = departmentTeams.reduce(
              (total, team) => total + team._count.users,
              0,
            );

            return (
              <div
                key={department.id}
                className="rounded border border-line bg-surface p-5"
              >
                <p className="text-sm font-medium text-ink">{department.name}</p>
                <p className="mt-1 text-xs text-muted">
                  {departmentTeams.length} {departmentTeams.length === 1 ? "team" : "teams"} ·{" "}
                  {memberCount} {memberCount === 1 ? "member" : "members"}
                </p>
                {departmentTeams.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {departmentTeams.map((team) => (
                      <li
                        key={team.id}
                        className="rounded border border-line bg-sunken px-2 py-0.5 text-xs text-muted"
                      >
                        {team.name}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">People</h2>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-sunken text-xs text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Department</th>
              <th className="px-5 py-3 font-medium">Team</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-5 py-3">
                  <p className="font-medium text-ink">{user.name}</p>
                  <p className="text-xs text-muted">{user.email}</p>
                </td>
                <td className="px-5 py-3">
                  <RoleBadge role={user.role} />
                </td>
                <td className="px-5 py-3 text-muted">{user.department?.name ?? "—"}</td>
                <td className="px-5 py-3 text-muted">{user.team?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
