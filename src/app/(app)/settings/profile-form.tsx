"use client";

import { useActionState, useState } from "react";
import { updateProfile, type SettingsState } from "./actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

export function ProfileForm({ initial }: { initial: { name: string; jobTitle: string } }) {
  const [action] = useState(() => updateProfile);
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-4 rounded border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold text-ink">Profile</h2>

      <div className="space-y-1.5">
        <label htmlFor="profile-name" className="block text-sm font-medium text-ink">
          Full name
        </label>
        <input
          id="profile-name"
          name="name"
          required
          maxLength={100}
          defaultValue={initial.name}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="profile-title" className="block text-sm font-medium text-ink">
          Job title
        </label>
        <input
          id="profile-title"
          name="jobTitle"
          maxLength={100}
          defaultValue={initial.jobTitle}
          placeholder="e.g. Support Agent"
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
        className="rounded bg-accent-fill px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
