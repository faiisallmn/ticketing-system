"use client";

import { useActionState, useState } from "react";
import type { TicketStatus } from "@/generated/prisma/enums";
import { updateTicketStatus, type ActionState } from "@/app/(app)/tickets/actions";
import { STATUS_LABELS } from "@/lib/labels";

const selectClass =
  "h-8 min-w-0 flex-1 rounded border border-line bg-surface px-2 text-[13px] text-ink outline-none";

export function StatusControl({
  ticketId,
  current,
  options,
}: {
  ticketId: string;
  current: TicketStatus;
  options: TicketStatus[];
}) {
  const [action] = useState(() => updateTicketStatus.bind(null, ticketId));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor={`status-${ticketId}`} className="block text-[13px] font-medium">
        Status
      </label>
      <div className="flex gap-2">
        <select
          id={`status-${ticketId}`}
          name="status"
          defaultValue={current}
          className={selectClass}
        >
          <option value={current}>{STATUS_LABELS[current]} (current)</option>
          {options
            .filter((status) => status !== current)
            .map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="h-8 shrink-0 rounded bg-accent-fill px-3 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          Change status
        </button>
      </div>
      {state?.error ? (
        <p role="alert" className="rounded border border-danger/40 bg-danger-soft px-2.5 py-1.5 text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
