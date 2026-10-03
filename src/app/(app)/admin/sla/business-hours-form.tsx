"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createBusinessHours, type SlaAdminState } from "./actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export function BusinessHoursForm() {
  const [action] = useState(() => createBusinessHours);
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
      <h2 className="text-sm font-semibold text-ink">New calendar</h2>

      <div className="space-y-1.5">
        <label htmlFor="bh-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="bh-name"
          name="name"
          required
          maxLength={80}
          placeholder="e.g. Standard support hours"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="bh-timezone" className="block text-sm font-medium text-ink">
          Timezone
        </label>
        <input
          id="bh-timezone"
          name="timezone"
          required
          defaultValue="Asia/Jakarta"
          placeholder="Asia/Jakarta"
          className={inputClass}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="block text-sm font-medium text-ink">Workdays</legend>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((day) => (
            <label
              key={day.value}
              className="flex cursor-pointer items-center rounded border border-line px-2.5 py-1 text-xs font-medium text-muted transition has-checked:border-accent has-checked:bg-accent-soft has-checked:text-ink"
            >
              <input
                type="checkbox"
                name="workdays"
                value={day.value}
                defaultChecked={day.value >= 1 && day.value <= 5}
                className="sr-only"
              />
              {day.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="bh-start" className="block text-sm font-medium text-ink">
            Start
          </label>
          <input
            id="bh-start"
            name="workStart"
            type="time"
            required
            defaultValue="09:00"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="bh-end" className="block text-sm font-medium text-ink">
            End
          </label>
          <input
            id="bh-end"
            name="workEnd"
            type="time"
            required
            defaultValue="17:00"
            className={inputClass}
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="isDefault" className="h-4 w-4 accent-accent" />
        Use as the default calendar
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
        {pending ? "Creating…" : "Create calendar"}
      </button>
    </form>
  );
}
