"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createSlaPolicy, type SlaAdminState } from "./actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

export function SlaPolicyForm({
  categories,
  calendars,
}: {
  categories: Array<{ id: string; name: string }>;
  calendars: Array<{ id: string; name: string; isDefault: boolean; isActive: boolean }>;
}) {
  const [action] = useState(() => createSlaPolicy);
  const [state, formAction, pending] = useActionState<SlaAdminState, FormData>(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state]);

  const defaultCalendar = calendars.find((calendar) => calendar.isDefault && calendar.isActive);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded border border-line bg-surface p-5"
    >
      <h2 className="text-sm font-semibold text-ink">New policy</h2>

      <div className="space-y-1.5">
        <label htmlFor="sla-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="sla-name"
          name="name"
          required
          maxLength={80}
          placeholder="e.g. Critical incidents"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="sla-category" className="block text-sm font-medium text-ink">
            Category
          </label>
          <select id="sla-category" name="categoryId" defaultValue="" className={inputClass}>
            <option value="">Any category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sla-priority" className="block text-sm font-medium text-ink">
            Priority
          </label>
          <select id="sla-priority" name="priority" defaultValue="" className={inputClass}>
            <option value="">Any priority</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="sla-response" className="block text-sm font-medium text-ink">
            First response (min)
          </label>
          <input
            id="sla-response"
            name="firstResponseMinutes"
            type="number"
            min={1}
            required
            defaultValue={240}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sla-resolution" className="block text-sm font-medium text-ink">
            Resolution (min)
          </label>
          <input
            id="sla-resolution"
            name="resolutionMinutes"
            type="number"
            min={1}
            required
            defaultValue={960}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="sla-calendar" className="block text-sm font-medium text-ink">
          Calendar
        </label>
        <select
          id="sla-calendar"
          name="businessHoursId"
          defaultValue={defaultCalendar?.id ?? ""}
          required
          className={inputClass}
        >
          <option value="">Pick a calendar</option>
          {calendars
            .filter((calendar) => calendar.isActive)
            .map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
              </option>
            ))}
        </select>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="isDefault" className="h-4 w-4 accent-accent" />
        Fallback default when nothing else matches
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
        {pending ? "Creating…" : "Create policy"}
      </button>
    </form>
  );
}
