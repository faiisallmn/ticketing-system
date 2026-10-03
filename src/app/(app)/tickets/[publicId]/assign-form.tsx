"use client";

import { useActionState, useState } from "react";
import { assignTicket, type ActionState } from "@/app/(app)/tickets/actions";

type Option = { id: string; name: string };

const selectClass =
  "h-8 w-full rounded border border-line bg-surface px-2 text-[13px] text-ink outline-none";

export function AssignForm({
  ticketId,
  currentAssigneeId,
  currentTeamId,
  teams,
  staff,
}: {
  ticketId: string;
  currentAssigneeId: string | null;
  currentTeamId: string | null;
  teams: Option[];
  staff: Option[];
}) {
  const [action] = useState(() => assignTicket.bind(null, ticketId));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-2">
      <span className="block text-[13px] font-medium">Assignment</span>
      <select
        name="teamId"
        defaultValue={currentTeamId ?? ""}
        aria-label="Team"
        className={selectClass}
      >
        <option value="">No team</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <select
        name="assigneeId"
        defaultValue={currentAssigneeId ?? ""}
        aria-label="Assignee"
        className={selectClass}
      >
        <option value="">Unassigned</option>
        {staff.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="h-8 w-full rounded border border-line bg-surface text-[13px] font-medium transition hover:bg-sunken disabled:opacity-60"
      >
        {pending ? "Assigning…" : "Assign"}
      </button>
      {state?.error ? (
        <p role="alert" className="rounded border border-danger/40 bg-danger-soft px-2.5 py-1.5 text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
