import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { StaffShell } from "./staff-shell";
import type { Theme } from "@/app/layout";

const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "REOPENED"] as const;
const RISK_WINDOW_MS = 24 * 3600 * 1000;

type RiskyTicket = {
  dueResponseAt: Date | null;
  dueResolutionAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
};

function countAtRisk(tickets: RiskyTicket[], now: number): number {
  return tickets.filter((ticket) => {
    const responseHot =
      !ticket.firstRespondedAt &&
      ticket.dueResponseAt &&
      ticket.dueResponseAt.getTime() <= now + RISK_WINDOW_MS;
    const resolutionHot =
      !ticket.resolvedAt &&
      ticket.dueResolutionAt &&
      ticket.dueResolutionAt.getTime() <= now + RISK_WINDOW_MS;
    return responseHot || resolutionHot;
  }).length;
}

export async function Sidebar({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  const user = await requireUser();

  const [mine, unassigned, open, risky, views] = await Promise.all([
    db.ticket.count({ where: { assigneeId: user.id, status: { in: [...ACTIVE_STATUSES] } } }),
    db.ticket.count({ where: { assigneeId: null, status: { in: [...ACTIVE_STATUSES] } } }),
    db.ticket.count({ where: { status: { in: [...ACTIVE_STATUSES] } } }),
    db.ticket.findMany({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        OR: [{ dueResponseAt: { not: null } }, { dueResolutionAt: { not: null } }],
      },
      select: {
        dueResponseAt: true,
        dueResolutionAt: true,
        firstRespondedAt: true,
        resolvedAt: true,
      },
    }),
    db.savedFilter.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, query: true },
    }),
  ]);

  // A server component renders once per request, so reading the clock here is
  // deterministic for that render (the rule below cannot tell RSC apart).
  // eslint-disable-next-line react-hooks/purity
  const atRisk = countAtRisk(risky, Date.now());

  return (
    <StaffShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        jobTitle: user.jobTitle,
      }}
      theme={theme}
      counts={{ mine, unassigned, atRisk, open }}
      views={views.map((view) => ({
        id: view.id,
        name: view.name,
        query: view.query as Record<string, string>,
      }))}
    >
      {children}
    </StaffShell>
  );
}
