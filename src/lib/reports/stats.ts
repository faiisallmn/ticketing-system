import type { TicketStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "REOPENED"] as const;

export type ReportFilter = {
  from: Date;
  to: Date;
  departmentId?: string | null;
  teamId?: string | null;
};

export type ScopeWhere = {
  departmentId?: string;
  teamId?: string;
};

function scopeWhere(filter: ReportFilter): ScopeWhere {
  return {
    ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
    ...(filter.teamId ? { teamId: filter.teamId } : {}),
  };
}

export type AgentRow = {
  id: string;
  name: string;
  open: number;
  resolved: number;
  avgResolutionMs: number | null;
};

export type CsatSummary = {
  average: number | null;
  count: number;
  distribution: Array<{ score: number; count: number }>;
  recent: Array<{
    publicId: string;
    title: string;
    score: number;
    comment: string | null;
    requester: string;
    assignee: string | null;
    resolvedAt: Date | null;
  }>;
};

export type ReportStats = {
  created: number;
  resolved: number;
  closed: number;
  reopened: number;
  breached: number;
  byStatus: Array<{ status: TicketStatus; count: number }>;
  byCategory: Array<{ name: string; count: number }>;
  byAgent: AgentRow[];
  avgFirstResponseMs: number | null;
  avgResolutionMs: number | null;
  responseSlaPct: number | null;
  resolutionSlaPct: number | null;
  csat: CsatSummary;
  backlogAge: Array<{ bucket: string; count: number }>;
  trend: Array<{ date: string; created: number; resolved: number }>;
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function percentage(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getReportStats(filter: ReportFilter): Promise<ReportStats> {
  const scope = scopeWhere(filter);
  const inRange = { gte: filter.from, lte: filter.to };

  const [
    created,
    resolved,
    closed,
    reopened,
    breached,
    statusGroups,
    categoryGroups,
    categories,
    firstResponses,
    resolutions,
    csatTickets,
    staff,
    openByAssignee,
    resolvedByAssignee,
    backlog,
  ] = await Promise.all([
    db.ticket.count({ where: { ...scope, createdAt: inRange } }),
    db.ticket.count({ where: { ...scope, resolvedAt: inRange } }),
    db.ticket.count({ where: { ...scope, closedAt: inRange } }),
    db.ticket.count({ where: { ...scope, reopenedAt: inRange } }),
    db.ticketEvent.count({
      where: {
        type: "SLA_BREACHED",
        createdAt: inRange,
        ticket: { ...scope },
      },
    }),
    db.ticket.groupBy({ by: ["status"], where: { ...scope }, _count: { _all: true } }),
    db.ticket.groupBy({
      by: ["categoryId"],
      where: { ...scope, createdAt: inRange },
      _count: { _all: true },
    }),
    db.category.findMany({ select: { id: true, name: true } }),
    db.ticket.findMany({
      where: { ...scope, firstRespondedAt: inRange },
      select: { createdAt: true, firstRespondedAt: true, dueResponseAt: true },
    }),
    db.ticket.findMany({
      where: { ...scope, resolvedAt: inRange },
      select: { createdAt: true, resolvedAt: true, dueResolutionAt: true },
    }),
    db.ticket.findMany({
      where: { ...scope, resolvedAt: inRange, csatScore: { not: null } },
      select: {
        publicId: true,
        title: true,
        csatScore: true,
        csatComment: true,
        resolvedAt: true,
        requester: { select: { name: true } },
        assignee: { select: { name: true } },
      },
      orderBy: { resolvedAt: "desc" },
    }),
    db.user.findMany({
      where: {
        role: { in: ["ADMIN", "MANAGER", "AGENT"] },
        isActive: true,
        ...(filter.teamId ? { teamId: filter.teamId } : {}),
        ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.ticket.groupBy({
      by: ["assigneeId"],
      where: { ...scope, status: { in: [...ACTIVE_STATUSES] }, assigneeId: { not: null } },
      _count: { _all: true },
    }),
    db.ticket.groupBy({
      by: ["assigneeId"],
      where: { ...scope, resolvedAt: inRange, assigneeId: { not: null } },
      _count: { _all: true },
      // Per-agent average resolution time needs the rows themselves (below).
    }),
    db.ticket.findMany({
      where: { ...scope, status: { in: [...ACTIVE_STATUSES] } },
      select: { createdAt: true },
    }),
  ]);

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const byCategory = categoryGroups.map((group) => ({
    name: group.categoryId ? (categoryNames.get(group.categoryId) ?? "Unknown") : "Uncategorized",
    count: group._count._all,
  }));

  const responseTimes = firstResponses.map(
    (ticket) => ticket.firstRespondedAt!.getTime() - ticket.createdAt.getTime(),
  );
  const resolutionTimes = resolutions.map(
    (ticket) => ticket.resolvedAt!.getTime() - ticket.createdAt.getTime(),
  );

  const responseDue = firstResponses.filter((ticket) => ticket.dueResponseAt !== null);
  const responseSlaPct = percentage(
    responseDue.filter((ticket) => ticket.firstRespondedAt! <= ticket.dueResponseAt!).length,
    responseDue.length,
  );
  const resolutionDue = resolutions.filter((ticket) => ticket.dueResolutionAt !== null);
  const resolutionSlaPct = percentage(
    resolutionDue.filter((ticket) => ticket.resolvedAt! <= ticket.dueResolutionAt!).length,
    resolutionDue.length,
  );

  const scores = csatTickets.map((ticket) => ticket.csatScore!);
  const distribution = [1, 2, 3, 4, 5].map((score) => ({
    score,
    count: scores.filter((value) => value === score).length,
  }));

  // Per-agent resolution averages (one extra grouped fetch, mapped in JS).
  const resolvedRows = await db.ticket.findMany({
    where: { ...scope, resolvedAt: inRange, assigneeId: { not: null } },
    select: { assigneeId: true, createdAt: true, resolvedAt: true },
  });
  const resolutionByAgent = new Map<string, number[]>();
  for (const row of resolvedRows) {
    const list = resolutionByAgent.get(row.assigneeId!) ?? [];
    list.push(row.resolvedAt!.getTime() - row.createdAt.getTime());
    resolutionByAgent.set(row.assigneeId!, list);
  }
  const openCounts = new Map(
    openByAssignee.map((group) => [group.assigneeId as string, group._count._all]),
  );
  const resolvedCounts = new Map(
    resolvedByAssignee.map((group) => [group.assigneeId as string, group._count._all]),
  );
  const byAgent: AgentRow[] = staff.map((member) => ({
    id: member.id,
    name: member.name,
    open: openCounts.get(member.id) ?? 0,
    resolved: resolvedCounts.get(member.id) ?? 0,
    avgResolutionMs: average(resolutionByAgent.get(member.id) ?? []),
  }));

  const now = Date.now();
  const buckets = [
    { bucket: "< 1 day", test: (ageMs: number) => ageMs < 24 * 3600 * 1000 },
    { bucket: "1–3 days", test: (ageMs: number) => ageMs < 3 * 24 * 3600 * 1000 },
    { bucket: "3–7 days", test: (ageMs: number) => ageMs < 7 * 24 * 3600 * 1000 },
    { bucket: "7–30 days", test: (ageMs: number) => ageMs < 30 * 24 * 3600 * 1000 },
    { bucket: "30+ days", test: () => true },
  ];
  const backlogAge = buckets.map(({ bucket }) => ({ bucket, count: 0 }));
  for (const ticket of backlog) {
    const age = now - ticket.createdAt.getTime();
    const index = buckets.findIndex(({ test }) => test(age));
    backlogAge[index]!.count += 1;
  }

  const trendMap = new Map<string, { created: number; resolved: number }>();
  const cursor = new Date(filter.from);
  while (cursor <= filter.to) {
    trendMap.set(dayKey(cursor), { created: 0, resolved: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  const [trendCreated, trendResolved] = await Promise.all([
    db.ticket.findMany({
      where: { ...scope, createdAt: inRange },
      select: { createdAt: true },
    }),
    db.ticket.findMany({
      where: { ...scope, resolvedAt: inRange },
      select: { resolvedAt: true },
    }),
  ]);
  for (const ticket of trendCreated) {
    const entry = trendMap.get(dayKey(ticket.createdAt));
    if (entry) entry.created += 1;
  }
  for (const ticket of trendResolved) {
    if (!ticket.resolvedAt) continue;
    const entry = trendMap.get(dayKey(ticket.resolvedAt));
    if (entry) entry.resolved += 1;
  }
  const trend = [...trendMap.entries()].map(([date, counts]) => ({ date, ...counts }));

  return {
    created,
    resolved,
    closed,
    reopened,
    breached,
    byStatus: statusGroups.map((group) => ({ status: group.status, count: group._count._all })),
    byCategory,
    byAgent,
    avgFirstResponseMs: average(responseTimes),
    avgResolutionMs: average(resolutionTimes),
    responseSlaPct,
    resolutionSlaPct,
    csat: {
      average:
        scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : null,
      count: scores.length,
      distribution,
      recent: csatTickets.slice(0, 8).map((ticket) => ({
        publicId: ticket.publicId,
        title: ticket.title,
        score: ticket.csatScore!,
        comment: ticket.csatComment,
        requester: ticket.requester.name,
        assignee: ticket.assignee?.name ?? null,
        resolvedAt: ticket.resolvedAt,
      })),
    },
    backlogAge,
    trend,
  };
}
