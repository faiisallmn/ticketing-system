"use client";

import { useActionState, useState } from "react";
import { updateUser, type UserAdminState } from "../actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

const labelClass = "block text-sm font-medium text-ink";

type Option = { id: string; name: string };

export function UserEditForm({
  userId,
  initial,
  departments,
  teams,
}: {
  userId: string;
  initial: {
    name: string;
    email: string;
    role: string;
    jobTitle: string;
    departmentId: string;
    teamId: string;
    isActive: boolean;
  };
  departments: Option[];
  teams: Array<Option & { departmentId: string }>;
}) {
  const [action] = useState(() => updateUser.bind(null, userId));
  const [state, formAction, pending] = useActionState<UserAdminState, FormData>(action, undefined);
  const [departmentId, setDepartmentId] = useState(initial.departmentId);

  const visibleTeams = departmentId
    ? teams.filter((team) => team.departmentId === departmentId)
    : teams;

  return (
    <form action={formAction} className="space-y-5 rounded border border-line bg-surface p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="user-name" className={labelClass}>
            Full name
          </label>
          <input
            id="user-name"
            name="name"
            required
            maxLength={100}
            defaultValue={initial.name}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="user-email" className={labelClass}>
            Email
          </label>
          <input
            id="user-email"
            name="email"
            type="email"
            required
            defaultValue={initial.email}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="user-role" className={labelClass}>
            Role
          </label>
          <select id="user-role" name="role" defaultValue={initial.role} className={inputClass}>
            <option value="REQUESTER">Requester</option>
            <option value="AGENT">Agent</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="user-title" className={labelClass}>
            Job title
          </label>
          <input
            id="user-title"
            name="jobTitle"
            maxLength={100}
            defaultValue={initial.jobTitle}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="user-department" className={labelClass}>
            Department
          </label>
          <select
            id="user-department"
            name="departmentId"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            className={inputClass}
          >
            <option value="">No department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="user-team" className={labelClass}>
            Team
          </label>
          <select
            id="user-team"
            name="teamId"
            defaultValue={
              visibleTeams.some((team) => team.id === initial.teamId) ? initial.teamId : ""
            }
            className={inputClass}
          >
            <option value="">No team</option>
            {visibleTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial.isActive}
          className="h-4 w-4 accent-accent"
        />
        Account active (disabled accounts cannot sign in)
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
        className="rounded bg-accent-fill px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
