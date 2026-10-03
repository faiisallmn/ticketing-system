"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { changePassword, type SettingsState } from "./actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

export function PasswordForm() {
  const [action] = useState(() => changePassword);
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(action, undefined);
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
      <div>
        <h2 className="text-sm font-semibold text-ink">Change password</h2>
        <p className="mt-1 text-xs text-muted">
          You will be signed out everywhere and sign back in with the new password.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pw-current" className="block text-sm font-medium text-ink">
          Current password
        </label>
        <input
          id="pw-current"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pw-new" className="block text-sm font-medium text-ink">
          New password
        </label>
        <input
          id="pw-new"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
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
        {pending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
