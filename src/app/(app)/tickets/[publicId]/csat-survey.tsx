"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { submitCsat, type ActionState } from "@/app/(app)/tickets/actions";

const RATINGS = [
  { value: 1, label: "Very poor" },
  { value: 2, label: "Poor" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Good" },
  { value: 5, label: "Excellent" },
];

export function CsatSurvey({ ticketId }: { ticketId: string }) {
  const [action] = useState(() => submitCsat.bind(null, ticketId));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);

  return (
    <section aria-labelledby={`csat-${ticketId}`}>
      <h2 id={`csat-${ticketId}`} className="text-sm font-semibold">
        How did we do
      </h2>
      <p className="mt-1 text-[13px] text-muted">
        Your ticket is resolved. Rate the support you received.
      </p>

      <form action={formAction} className="mt-3 space-y-3">
        <div className="flex gap-1.5" role="radiogroup" aria-label="Satisfaction rating">
          {RATINGS.map((rating) => (
            <label
              key={rating.value}
              title={rating.label}
              className="cursor-pointer rounded p-1 text-faint transition has-checked:text-warn hover:text-warn"
            >
              <input
                type="radio"
                name="score"
                value={rating.value}
                required
                className="sr-only"
              />
              <Star size={24} strokeWidth={1.5} fill="currentColor" aria-hidden />
              <span className="sr-only">{rating.label}</span>
            </label>
          ))}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`csat-comment-${ticketId}`} className="block text-[13px] font-medium">
            Anything we should know <span className="font-normal text-faint">(optional)</span>
          </label>
          <textarea
            id={`csat-comment-${ticketId}`}
            name="comment"
            rows={3}
            maxLength={1000}
            placeholder="What went well, what could be better"
            className="w-full max-w-[72ch] resize-y rounded border border-line bg-surface px-3 py-2 text-sm leading-[22px] outline-none placeholder:text-faint"
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
          className="h-9 rounded bg-accent-fill px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send feedback"}
        </button>
      </form>
    </section>
  );
}
