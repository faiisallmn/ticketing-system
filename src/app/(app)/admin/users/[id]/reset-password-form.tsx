"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { resetUserPassword, type UserAdminState } from "../actions";

export function ResetPasswordForm({ userId, userName }: { userId: string; userName: string }) {
  const [action] = useState(() => resetUserPassword.bind(null, userId));
  const [state, formAction, pending] = useActionState<UserAdminState, FormData>(action, undefined);
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
        <h2 className="text-sm font-semibold text-ink">Reset password</h2>
        <p className="mt-1 text-xs text-muted">
          {userName} will be signed out everywhere and must sign in with the new password.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`reset-${userId}`} className="block text-sm font-medium text-ink">
          New temporary password
        </label>
        <input
          id={`reset-${userId}`}
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none"
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
        className="rounded border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-sunken disabled:opacity-60"
      >
        {pending ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}
