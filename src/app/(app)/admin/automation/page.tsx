import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import {
  ESCALATION_ACTION_LABELS,
  PRIORITY_LABELS,
  STRATEGY_LABELS,
  TRIGGER_LABELS,
} from "@/lib/labels";
import { formatDuration } from "@/lib/sla/state";
import {
  deleteAssignRule,
  deleteEscalationRule,
  toggleAssignRule,
  toggleEscalationRule,
} from "./actions";
import { AssignRuleForm } from "./assign-rule-form";
import { EscalationRuleForm } from "./escalation-rule-form";

export const metadata: Metadata = {
  title: "Automation",
};

export default async function AutomationPage() {
  await requirePermission("automation:manage");

  const [assignRules, escalationRules, categories, teams, staff] = await Promise.all([
    db.autoAssignmentRule.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        category: { select: { name: true } },
        team: { select: { name: true } },
        targetTeam: { select: { name: true } },
        targetUser: { select: { name: true } },
      },
    }),
    db.escalationRule.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        category: { select: { name: true } },
        team: { select: { name: true } },
        targetTeam: { select: { name: true } },
      },
    }),
    db.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER", "AGENT"] }, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Automation</h1>
        <p className="mt-1 text-sm text-muted">
          Rules run in order — the first matching rule wins. New rules start disabled.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Auto-assignment</h2>
          {assignRules.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No rules — new tickets stay unassigned until someone picks them up.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded border border-line">
              {assignRules.map((rule, index) => (
                <li key={rule.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      <span className="mr-2 text-xs text-faint">#{index + 1}</span>
                      {rule.name}
                      {!rule.isActive ? (
                        <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted">
                          Disabled
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {STRATEGY_LABELS[rule.strategy]} ·{" "}
                      {rule.category?.name ?? "any category"} · {rule.team?.name ?? "any team"} →{" "}
                      {rule.targetUser?.name ?? rule.targetTeam?.name ?? "ticket's team"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <form action={toggleAssignRule}>
                      <input type="hidden" name="id" value={rule.id} />
                      <input type="hidden" name="active" value={rule.isActive ? "false" : "true"} />
                      <button
                        type="submit"
                        className="rounded border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sunken"
                      >
                        {rule.isActive ? "Disable" : "Enable"}
                      </button>
                    </form>
                    <form action={deleteAssignRule}>
                      <input type="hidden" name="id" value={rule.id} />
                      <button
                        type="submit"
                        className="rounded border border-line px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger-soft"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <AssignRuleForm categories={categories} teams={teams} staff={staff} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Escalation</h2>
          {escalationRules.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No rules — breached deadlines are recorded but nothing acts on them.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded border border-line">
              {escalationRules.map((rule, index) => (
                <li key={rule.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      <span className="mr-2 text-xs text-faint">#{index + 1}</span>
                      {rule.name}
                      {!rule.isActive ? (
                        <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted">
                          Disabled
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {TRIGGER_LABELS[rule.trigger]} ({formatDuration(rule.thresholdMinutes * 60000)}
                      ) · {rule.category?.name ?? "any category"} ·{" "}
                      {rule.team?.name ?? "any team"} ·{" "}
                      {rule.priority ? PRIORITY_LABELS[rule.priority] : "any priority"} →{" "}
                      {ESCALATION_ACTION_LABELS[rule.action]}
                      {rule.targetTeam ? ` (${rule.targetTeam.name})` : ""}
                      {rule.newPriority ? ` (${PRIORITY_LABELS[rule.newPriority]})` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <form action={toggleEscalationRule}>
                      <input type="hidden" name="id" value={rule.id} />
                      <input type="hidden" name="active" value={rule.isActive ? "false" : "true"} />
                      <button
                        type="submit"
                        className="rounded border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sunken"
                      >
                        {rule.isActive ? "Disable" : "Enable"}
                      </button>
                    </form>
                    <form action={deleteEscalationRule}>
                      <input type="hidden" name="id" value={rule.id} />
                      <button
                        type="submit"
                        className="rounded border border-line px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger-soft"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <EscalationRuleForm categories={categories} teams={teams} />
      </section>
    </div>
  );
}
