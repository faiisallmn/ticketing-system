"use client";

import { useActionState, useState } from "react";
import type { Priority, Severity } from "@/generated/prisma/enums";
import {
  updateTicketPriority,
  updateTicketSeverity,
  type ActionState,
} from "@/app/(app)/tickets/actions";
import { PRIORITY_LABELS, SEVERITY_LABELS } from "@/lib/labels";

const selectClass =
  "h-8 min-w-0 flex-1 rounded border border-line bg-surface px-2 text-[13px] text-ink outline-none";

const buttonClass =
  "h-8 shrink-0 rounded border border-line bg-surface px-3 text-[13px] font-medium transition hover:bg-sunken disabled:opacity-60";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded border border-danger/40 bg-danger-soft px-2.5 py-1.5 text-[13px] text-danger">
      {message}
    </p>
  );
}

export function PriorityControl({
  ticketId,
  current,
}: {
  ticketId: string;
  current: Priority;
}) {
  const [action] = useState(() => updateTicketPriority.bind(null, ticketId));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor={`priority-${ticketId}`} className="block text-[13px] font-medium">
        Priority
      </label>
      <div className="flex gap-2">
        <select id={`priority-${ticketId}`} name="priority" defaultValue={current} className={selectClass}>
          {(Object.keys(PRIORITY_LABELS) as Priority[]).map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABELS[priority]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={buttonClass}>
          Save priority
        </button>
      </div>
      <FieldError message={state?.error} />
    </form>
  );
}

export function SeverityControl({
  ticketId,
  current,
}: {
  ticketId: string;
  current: Severity;
}) {
  const [action] = useState(() => updateTicketSeverity.bind(null, ticketId));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor={`severity-${ticketId}`} className="block text-[13px] font-medium">
        Severity
      </label>
      <div className="flex gap-2">
        <select id={`severity-${ticketId}`} name="severity" defaultValue={current} className={selectClass}>
          {(Object.keys(SEVERITY_LABELS) as Severity[]).map((severity) => (
            <option key={severity} value={severity}>
              {SEVERITY_LABELS[severity]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={buttonClass}>
          Save severity
        </button>
      </div>
      <FieldError message={state?.error} />
    </form>
  );
}
