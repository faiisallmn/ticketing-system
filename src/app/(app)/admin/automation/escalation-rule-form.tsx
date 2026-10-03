"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createEscalationRule, type AutomationState } from "./actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

type Option = { id: string; name: string };

export function EscalationRuleForm({
  categories,
  teams,
}: {
  categories: Option[];
  teams: Option[];
}) {
  const [action] = useState(() => createEscalationRule);
  const [state, formAction, pending] = useActionState<AutomationState, FormData>(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded border border-line bg-surface p-5"
    >
      <h2 className="text-sm font-semibold text-ink">New escalation rule</h2>

      <div className="space-y-1.5">
        <label htmlFor="esc-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="esc-name"
          name="name"
          required
          maxLength={80}
          placeholder="e.g. Breached response SLA"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="esc-trigger" className="block text-sm font-medium text-ink">
            Trigger
          </label>
          <select id="esc-trigger" name="trigger" defaultValue="SLA_BREACH" className={inputClass}>
            <option value="SLA_BREACH_IMMINENT">SLA about to breach</option>
            <option value="SLA_BREACH">SLA breached</option>
            <option value="WAITING_TOO_LONG">Waiting too long</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="esc-threshold" className="block text-sm font-medium text-ink">
            Threshold (min)
          </label>
          <input
            id="esc-threshold"
            name="thresholdMinutes"
            type="number"
            min={1}
            required
            defaultValue={60}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="esc-category" className="block text-sm font-medium text-ink">
            Category
          </label>
          <select id="esc-category" name="categoryId" defaultValue="" className={inputClass}>
            <option value="">Any</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="esc-team" className="block text-sm font-medium text-ink">
            Team
          </label>
          <select id="esc-team" name="teamId" defaultValue="" className={inputClass}>
            <option value="">Any</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="esc-priority" className="block text-sm font-medium text-ink">
            Priority
          </label>
          <select id="esc-priority" name="priority" defaultValue="" className={inputClass}>
            <option value="">Any</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="esc-action" className="block text-sm font-medium text-ink">
          Action
        </label>
        <select id="esc-action" name="action" defaultValue="NOTIFY_MANAGER" className={inputClass}>
          <option value="RAISE_PRIORITY">Raise priority</option>
          <option value="REASSIGN_TEAM">Move to another team</option>
          <option value="NOTIFY_MANAGER">Notify manager</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="esc-target-team" className="block text-sm font-medium text-ink">
            Target team
          </label>
          <select id="esc-target-team" name="targetTeamId" defaultValue="" className={inputClass}>
            <option value="">—</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="esc-new-priority" className="block text-sm font-medium text-ink">
            Set priority to
          </label>
          <select id="esc-new-priority" name="newPriority" defaultValue="" className={inputClass}>
            <option value="">Bump one level</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="esc-cooldown" className="block text-sm font-medium text-ink">
            Cooldown (min)
          </label>
          <input
            id="esc-cooldown"
            name="cooldownMinutes"
            type="number"
            min={5}
            defaultValue={60}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="esc-position" className="block text-sm font-medium text-ink">
            Order
          </label>
          <input
            id="esc-position"
            name="position"
            type="number"
            min={0}
            defaultValue={0}
            className={inputClass}
          />
        </div>
      </div>

      {state?.error ? (
        <p
          role="alert"
          className="rounded border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-accent-fill px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create rule (starts disabled)"}
      </button>
    </form>
  );
}
