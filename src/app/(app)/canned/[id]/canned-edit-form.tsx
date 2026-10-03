"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { updateCannedResponse, type CannedState } from "../actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

type Option = { id: string; name: string };

export function CannedEditForm({
  reply,
  teams,
  categories,
  canPickAnyTeam,
}: {
  reply: {
    id: string;
    title: string;
    body: string;
    shortcut: string | null;
    scope: "GLOBAL" | "TEAM";
    teamId: string | null;
    categoryId: string | null;
    isActive: boolean;
  };
  teams: Option[];
  categories: Option[];
  canPickAnyTeam: boolean;
}) {
  const [action] = useState(() => updateCannedResponse.bind(null, reply.id));
  const [state, formAction, pending] = useActionState<CannedState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-4 rounded border border-line bg-surface p-6">
      <div className="space-y-1.5">
        <label htmlFor="canned-title" className="block text-sm font-medium text-ink">
          Title
        </label>
        <input
          id="canned-title"
          name="title"
          required
          maxLength={120}
          defaultValue={reply.title}
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
          rows={6}
          defaultValue={reply.body}
          className={`${inputClass} resize-y`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="canned-scope" className="block text-sm font-medium text-ink">
            Visible to
          </label>
          <select id="canned-scope" name="scope" defaultValue={reply.scope} className={inputClass}>
            <option value="GLOBAL">Everyone</option>
            <option value="TEAM">One team</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="canned-team" className="block text-sm font-medium text-ink">
            Team
          </label>
          <select id="canned-team" name="teamId" defaultValue={reply.teamId ?? ""} className={inputClass}>
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
          <select
            id="canned-category"
            name="categoryId"
            defaultValue={reply.categoryId ?? ""}
            className={inputClass}
          >
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
            defaultValue={reply.shortcut ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={reply.isActive}
          className="h-4 w-4 accent-accent"
        />
        Active (shown in the composer)
      </label>

      {state?.error ? (
        <p
          role="alert"
          className="rounded border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent-fill px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link
          href="/canned"
          className="rounded border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-sunken"
        >
          Back
        </Link>
      </div>
    </form>
  );
}
