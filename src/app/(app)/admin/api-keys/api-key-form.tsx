"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createApiKey, type ApiKeyState } from "./actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

export function ApiKeyForm({
  users,
}: {
  users: Array<{ id: string; name: string; email: string; role: string }>;
}) {
  const [action] = useState(() => createApiKey);
  const [state, formAction, pending] = useActionState<ApiKeyState, FormData>(action, undefined);
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
      <h2 className="text-sm font-semibold text-ink">New key</h2>

      {state?.key ? (
        <div className="space-y-1.5 rounded border border-line bg-sunken p-3">
          <p className="text-xs font-medium text-ink">
            Copy it now — it will never be shown again:
          </p>
          <code className="block break-all rounded bg-surface px-2 py-1.5 tabular-nums text-xs text-ink">
            {state.key}
          </code>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="key-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="key-name"
          name="name"
          required
          maxLength={80}
          placeholder="e.g. CRM sync"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="key-owner" className="block text-sm font-medium text-ink">
          Acts as
        </label>
        <select id="key-owner" name="userId" required defaultValue="" className={inputClass}>
          <option value="">Pick a user</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.role})
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="block text-sm font-medium text-ink">Scopes</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="scopes"
            value="tickets:read"
            defaultChecked
            className="h-4 w-4 accent-accent"
          />
          tickets:read — list and view tickets
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="scopes"
            value="tickets:write"
            defaultChecked
            className="h-4 w-4 accent-accent"
          />
          tickets:write — create, update, comment
        </label>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="key-expires" className="block text-sm font-medium text-ink">
          Expires <span className="font-normal text-faint">(optional)</span>
        </label>
        <input id="key-expires" name="expiresAt" type="date" className={inputClass} />
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
        {pending ? "Creating…" : "Create key"}
      </button>
    </form>
  );
}
