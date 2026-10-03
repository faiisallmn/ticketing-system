"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TicketStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "@/lib/labels";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "var(--st-open)",
  IN_PROGRESS: "var(--st-progress)",
  WAITING_ON_CUSTOMER: "var(--st-waiting)",
  RESOLVED: "var(--st-resolved)",
  CLOSED: "var(--st-resolved)",
  REOPENED: "var(--accent)",
};

function Empty({ label }: { label: string }) {
  return <p className="py-10 text-center text-sm text-faint">{label}</p>;
}

function hasData(rows: Array<Record<string, unknown>>, keys: string[]): boolean {
  return rows.some((row) => keys.some((key) => Number(row[key] ?? 0) > 0));
}

export function VolumeChart({ data }: { data: Array<{ date: string; created: number; resolved: number }> }) {
  if (!hasData(data, ["created", "resolved"])) return <Empty label="No tickets in this range." />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--ink-muted)" }} tickFormatter={(value: string) => value.slice(5)} />
        <YAxis tick={{ fontSize: 11, fill: "var(--ink-muted)" }} allowDecimals={false} />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 4, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="created" name="Created" fill="var(--st-open)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="resolved" name="Resolved" fill="var(--st-resolved)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusDonut({ data }: { data: Array<{ status: string; count: number }> }) {
  if (!hasData(data, ["count"])) return <Empty label="No open tickets." />;
  const rows = data.map((row) => ({
    ...row,
    label: `${STATUS_LABELS[row.status as TicketStatus] ?? row.status} (${row.count})`,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="count"
          nameKey="label"
          innerRadius={52}
          outerRadius={88}
          paddingAngle={2}
        >
          {rows.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "var(--ink-faint)"} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 4, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CategoryBars({ data }: { data: Array<{ name: string; count: number }> }) {
  if (!hasData(data, ["count"])) return <Empty label="No tickets in this range." />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--ink-muted)" }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--ink-muted)" }} width={120} />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 4, fontSize: 12 }} />
        <Bar dataKey="count" name="Tickets" fill="var(--accent)" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AgentBars({ data }: { data: Array<{ name: string; open: number; resolved: number }> }) {
  const active = data.filter((row) => row.open > 0 || row.resolved > 0);
  if (active.length === 0) return <Empty label="No agent activity in scope." />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, active.length * 40)}>
      <BarChart data={active} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--ink-muted)" }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--ink-muted)" }} width={120} />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 4, fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="open" name="Open" fill="var(--st-progress)" radius={[0, 3, 3, 0]} />
        <Bar dataKey="resolved" name="Resolved" fill="var(--st-resolved)" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
