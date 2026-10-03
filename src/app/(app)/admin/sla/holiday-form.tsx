"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createHoliday, type SlaAdminState } from "./actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

export function HolidayForm() {
  const [action] = useState(() => createHoliday);
  const [state, formAction, pending] = useActionState<SlaAdminState, FormData>(action, undefined);
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
      <h2 className="text-sm font-semibold text-ink">New holiday</h2>

      <div className="space-y-1.5">
        <label htmlFor="holiday-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="holiday-name"
          name="name"
          required
          maxLength={120}
          placeholder="e.g. Independence Day"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="holiday-date" className="block text-sm font-medium text-ink">
          Date
        </label>
        <input id="holiday-date" name="date" type="date" required className={inputClass} />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="isRecurring" defaultChecked className="h-4 w-4 accent-accent" />
        Repeats every year
      </label>

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
        {pending ? "Adding…" : "Add holiday"}
      </button>
    </form>
  );
}
