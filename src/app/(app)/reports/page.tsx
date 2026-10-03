import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { getReportStats } from "@/lib/reports/stats";
import { formatDuration } from "@/lib/sla/state";
import { formatDateTime, timeAgo } from "@/lib/format";
import { AgentBars, CategoryBars, StatusDonut, VolumeChart } from "@/components/reports/charts";

export const metadata: Metadata = {
  title: "Reports",
};

type Props = {
  searchParams: Promise<{ days?: string; departmentId?: string; teamId?: string }>;
};

function parseDays(raw: string | undefined): number {
  const days = Number.parseInt(raw ?? "", 10);
  return [7, 30, 90].includes(days) ? days : 30;
}

function displayMs(value: number | null): string {
  return value === null ? "—" : formatDuration(value);
}

function displayPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

export default async function ReportsPage({ searchParams }: Props) {
  await requirePermission("report:view");

  const params = await searchParams;
  const days = parseDays(params.days);
  const departmentId = params.departmentId || "";
  const teamId = params.teamId || "";

  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);

  const [departments, teams, stats] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.team.findMany({
      ...(departmentId ? { where: { departmentId } } : {}),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getReportStats({
      from,
      to,
      departmentId: departmentId || null,
      teamId: teamId || null,
    }),
  ]);

  const query = new URLSearchParams({
    days: String(days),
    ...(departmentId ? { departmentId } : {}),
    ...(teamId ? { teamId } : {}),
  }).toString();

  const cards = [
    { label: "Created", value: String(stats.created) },
    { label: "Resolved", value: String(stats.resolved) },
    { label: "Avg first response", value: displayMs(stats.avgFirstResponseMs) },
    { label: "Avg resolution", value: displayMs(stats.avgResolutionMs) },
    { label: "Response SLA met", value: displayPct(stats.responseSlaPct) },
    { label: "Resolution SLA met", value: displayPct(stats.resolutionSlaPct) },
    { label: "SLA breaches", value: String(stats.breached) },
    {
      label: "CSAT",
      value: stats.csat.average === null ? "—" : `${stats.csat.average}/5 (${stats.csat.count})`,
    },
  ];

  const maxBacklog = Math.max(1, ...stats.backlogAge.map((row) => row.count));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Reports</h1>
          <p className="mt-1 text-sm text-muted">
            Last {days} days · {formatDateTime(from)} → {formatDateTime(to)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/api/reports/export?type=tickets&${query}`}
            className="rounded border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-sunken"
          >
            Export tickets CSV
          </Link>
          <Link
            href={`/api/reports/export?type=csat&${query}`}
            className="rounded border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-sunken"
          >
            Export CSAT CSV
          </Link>
        </div>
      </div>

      <form
        method="get"
        action="/reports"
        className="flex flex-wrap items-end gap-3 rounded border border-line bg-surface p-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="days" className="block text-xs font-medium text-muted">
            Range
          </label>
          <select
            id="days"
            name="days"
            defaultValue={String(days)}
            className="rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="departmentId" className="block text-xs font-medium text-muted">
            Department
          </label>
          <select
            id="departmentId"
            name="departmentId"
            defaultValue={departmentId}
            className="rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none"
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="teamId" className="block text-xs font-medium text-ink">
            Team
          </label>
          <select
            id="teamId"
            name="teamId"
            defaultValue={teamId}
            className="rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none"
          >
            <option value="">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-accent-fill px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          Apply
        </button>
      </form>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded border border-line bg-surface p-5">
            <p className="text-sm text-muted">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Volume</h2>
        <p className="mb-2 text-xs text-muted">Tickets created vs resolved per day.</p>
        <VolumeChart data={stats.trend} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Open by status</h2>
          <p className="mb-2 text-xs text-muted">Current snapshot, same scope.</p>
          <StatusDonut data={stats.byStatus} />
        </div>
        <div className="rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Created by category</h2>
          <p className="mb-2 text-xs text-muted">Tickets created in range.</p>
          <CategoryBars data={stats.byCategory} />
        </div>
      </section>

      <section className="rounded border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Agents</h2>
        <p className="mb-2 text-xs text-muted">Open load vs resolved in range.</p>
        <AgentBars data={stats.byAgent} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Backlog age</h2>
          <p className="mb-3 text-xs text-muted">Currently open tickets by age.</p>
          <ul className="space-y-2">
            {stats.backlogAge.map((row) => (
              <li key={row.bucket} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-xs text-muted">{row.bucket}</span>
                <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full bg-muted"
                    style={{ width: `${Math.round((row.count / maxBacklog) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-sm font-medium text-ink">
                  {row.count}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink">Satisfaction</h2>
          <p className="mb-3 text-xs text-muted">
            {stats.csat.count === 0
              ? "No ratings in range yet."
              : `${stats.csat.count} ${stats.csat.count === 1 ? "rating" : "ratings"} in range.`}
          </p>
          {stats.csat.count > 0 ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-3xl font-semibold tabular-nums text-ink">
                <Star size={26} strokeWidth={1.5} fill="currentColor" className="text-warn" aria-hidden />
                {stats.csat.average}
              </p>
              <ul className="space-y-1.5">
                {stats.csat.distribution.map((row) => {
                  const pct =
                    stats.csat.count === 0
                      ? 0
                      : Math.round((row.count / stats.csat.count) * 100);
                  return (
                    <li key={row.score} className="flex items-center gap-2">
                      <span className="flex w-8 shrink-0 items-center gap-0.5 text-xs tabular-nums text-muted">
                        {row.score}
                        <Star size={11} strokeWidth={1.5} fill="currentColor" aria-hidden />
                      </span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden bg-sunken">
                        <div className="h-full bg-warn" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs text-muted">{row.count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {stats.csat.recent.length > 0 ? (
        <section className="rounded border border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Recent feedback</h2>
          </div>
          <ul className="divide-y divide-line">
            {stats.csat.recent.map((item) => (
              <li key={item.publicId} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/tickets/${item.publicId}`}
                    className="tabular-nums text-xs font-medium text-ink hover:underline"
                  >
                    {item.publicId}
                  </Link>
                  <span className="flex items-center gap-1 text-xs font-medium text-warn">
                    <Star size={12} strokeWidth={1.5} fill="currentColor" aria-hidden />
                    {item.score}/5
                  </span>
                  <span className="text-xs text-muted" title={item.resolvedAt ? formatDateTime(item.resolvedAt) : undefined}>
                    {item.resolvedAt ? timeAgo(item.resolvedAt) : ""}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-ink" title={item.title}>
                  {item.title}
                </p>
                {item.comment ? (
                  <p className="mt-0.5 text-sm text-muted">
                    “{item.comment}” — {item.requester}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-faint">{item.requester}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
