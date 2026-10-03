"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createAssignRule, type AutomationState } from "./actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

type Option = { id: string; name: string };

export function AssignRuleForm({
  categories,
  teams,
  staff,
}: {
  categories: Option[];
  teams: Option[];
  staff: Option[];
}) {
  const [action] = useState(() => createAssignRule);
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
      <h2 className="text-sm font-semibold text-ink">New assignment rule</h2>

      <div className="space-y-1.5">
        <label htmlFor="assign-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="assign-name"
          name="name"
          required
          maxLength={80}
          placeholder="e.g. Billing goes to specialists"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="assign-strategy" className="block text-sm font-medium text-ink">
          Strategy
        </label>
        <select id="assign-strategy" name="strategy" defaultValue="ROUND_ROBIN" className={inputClass}>
          <option value="ROUND_ROBIN">Round robin</option>
          <option value="CATEGORY">Category routing</option>
          <option value="WORKLOAD">Lightest load</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="assign-category" className="block text-sm font-medium text-ink">
            Category
          </label>
          <select id="assign-category" name="categoryId" defaultValue="" className={inputClass}>
            <option value="">Any</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="assign-team" className="block text-sm font-medium text-ink">
            Ticket team
          </label>
          <select id="assign-team" name="teamId" defaultValue="" className={inputClass}>
            <option value="">Any</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="assign-target-team" className="block text-sm font-medium text-ink">
            Target team
          </label>
          <select id="assign-target-team" name="targetTeamId" defaultValue="" className={inputClass}>
            <option value="">Ticket&apos;s team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="assign-target-user" className="block text-sm font-medium text-ink">
            Target person
          </label>
          <select id="assign-target-user" name="targetUserId" defaultValue="" className={inputClass}>
            <option value="">Decide by strategy</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="assign-position" className="block text-sm font-medium text-ink">
          Order <span className="font-normal text-faint">(lower runs first)</span>
        </label>
        <input
          id="assign-position"
          name="position"
          type="number"
          min={0}
          defaultValue={0}
          className={inputClass}
        />
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
