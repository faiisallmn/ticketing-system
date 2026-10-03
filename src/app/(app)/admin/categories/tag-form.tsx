"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createTag, type AdminActionState } from "./actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

export function TagForm() {
  const [action] = useState(() => createTag);
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(action, undefined);
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
      <h2 className="text-sm font-semibold text-ink">New tag</h2>

      <div className="space-y-1.5">
        <label htmlFor="tag-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="tag-name"
          name="name"
          required
          maxLength={40}
          placeholder="e.g. vip, outage, follow-up"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tag-color" className="block text-sm font-medium text-ink">
          Colour
        </label>
        <input
          id="tag-color"
          name="color"
          type="color"
          defaultValue="#71717a"
          className="h-9 w-full cursor-pointer rounded border border-line bg-surface px-1"
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
        {pending ? "Creating…" : "Create tag"}
      </button>
    </form>
  );
}
