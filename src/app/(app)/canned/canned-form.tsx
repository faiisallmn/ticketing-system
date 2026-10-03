"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createCannedResponse, type CannedState } from "./actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

type Option = { id: string; name: string };

export function CannedForm({
  teams,
  categories,
  canPickAnyTeam,
}: {
  teams: Option[];
  categories: Option[];
  canPickAnyTeam: boolean;
}) {
  const [action] = useState(() => createCannedResponse);
  const [state, formAction, pending] = useActionState<CannedState, FormData>(action, undefined);
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
      <h2 className="text-sm font-semibold text-ink">New reply</h2>

      <div className="space-y-1.5">
        <label htmlFor="canned-title" className="block text-sm font-medium text-ink">
          Title
        </label>
        <input
          id="canned-title"
          name="title"
          required
          maxLength={120}
          placeholder="e.g. Asking for screenshots"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="canned-body" className="block text-sm font-medium text-ink">
          Body
        </label>
        <textarea
          id="canned-body"
          name="body"
          required
          rows={5}
          placeholder="The text inserted into the reply…"
          className={`${inputClass} resize-y`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="canned-scope" className="block text-sm font-medium text-ink">
            Visible to
          </label>
          <select id="canned-scope" name="scope" defaultValue="GLOBAL" className={inputClass}>
            <option value="GLOBAL">Everyone</option>
            <option value="TEAM">One team</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="canned-team" className="block text-sm font-medium text-ink">
            Team
          </label>
          <select id="canned-team" name="teamId" defaultValue="" className={inputClass}>
            <option value="">{canPickAnyTeam ? "—" : "My team"}</option>
            {canPickAnyTeam
              ? teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))
              : null}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="canned-category" className="block text-sm font-medium text-ink">
            Category
          </label>
          <select id="canned-category" name="categoryId" defaultValue="" className={inputClass}>
            <option value="">Any category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="canned-shortcut" className="block text-sm font-medium text-ink">
            Shortcut
          </label>
          <input
            id="canned-shortcut"
            name="shortcut"
            maxLength={40}
            placeholder="e.g. /screenshot"
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
        {pending ? "Creating…" : "Create reply"}
      </button>
    </form>
  );
}
