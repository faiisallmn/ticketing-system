"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveFilterView, type FilterViewState } from "./saved-views";

export function SaveViewForm({ current }: { current: Record<string, string> }) {
  const [action] = useState(() => saveFilterView);
  const [state, formAction, pending] = useActionState<FilterViewState, FormData>(action, undefined);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-dashed border-line px-3 py-1 text-xs font-medium text-muted transition hover:border-faint hover:text-ink"
      >
        + Save current view
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-3 pr-1"
    >
      {Object.entries(current).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <input
        name="name"
        required
        minLength={2}
        maxLength={60}
        placeholder="View name…"
        aria-label="View name"
        className="w-28 bg-transparent text-xs text-ink outline-none placeholder:text-faint"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent-fill px-2.5 py-0.5 text-xs font-medium text-white disabled:opacity-60"
      >
        Save
      </button>
      {state?.error ? (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
