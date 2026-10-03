"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addComment, type ActionState } from "@/app/(app)/tickets/actions";
import { fetchCannedResponse } from "@/app/(app)/canned/actions";

export function CommentComposer({
  ticketId,
  canWriteInternal,
  requesterName,
  canned,
}: {
  ticketId: string;
  canWriteInternal: boolean;
  requesterName: string;
  canned: Array<{ id: string; title: string }>;
}) {
  const [action] = useState(() => addComment.bind(null, ticketId));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [inserting, setInserting] = useState(false);
  const wasPending = useRef(false);

  // Clear the box only after a submission finishes without an error, so a
  // failed post never wipes what the user typed.
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state]);

  async function insertCanned(id: string) {
    if (!id || inserting) return;
    setInserting(true);
    try {
      const response = await fetchCannedResponse(id);
      if (response.body && bodyRef.current) {
        const field = bodyRef.current;
        field.value = field.value
          ? `${field.value.replace(/\s+$/, "")}\n\n${response.body}`
          : response.body;
        field.focus();
      }
    } finally {
      setInserting(false);
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 border-t border-line pt-4"
    >
      <label htmlFor={`comment-${ticketId}`} className="block text-sm font-semibold">
        Add a reply
      </label>
      <textarea
        id={`comment-${ticketId}`}
        ref={bodyRef}
        name="body"
        required
        rows={4}
        placeholder={`Reply to ${requesterName}…`}
        className="w-full resize-y rounded border border-line bg-surface px-3 py-2 text-sm leading-[22px] outline-none placeholder:text-faint"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {canWriteInternal ? (
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
              <input
                type="checkbox"
                name="isInternal"
                className="h-3.5 w-3.5 accent-accent"
              />
              Internal note, not visible to requester
            </label>
          ) : (
            <span className="text-xs text-faint">Visible to the requester</span>
          )}

          {canned.length > 0 ? (
            <select
              aria-label="Insert template"
              defaultValue=""
              disabled={inserting}
              onChange={(event) => {
                void insertCanned(event.target.value);
                event.target.value = "";
              }}
              className="h-8 rounded border border-line bg-surface px-2 text-[13px] text-muted outline-none disabled:opacity-60"
            >
              <option value="">{inserting ? "Inserting…" : "Insert template…"}</option>
              {canned.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded bg-accent-fill px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send reply"}
        </button>
      </div>

      {state?.error ? (
        <p
          role="alert"
          className="rounded border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
