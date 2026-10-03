"use client";

import { useActionState, useState } from "react";
import { createUser, type UserAdminState } from "../actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

const labelClass = "block text-sm font-medium text-ink";

type Option = { id: string; name: string };

export function UserCreateForm({
  departments,
  teams,
}: {
  departments: Option[];
  teams: Array<Option & { departmentId: string }>;
}) {
  const [action] = useState(() => createUser);
  const [state, formAction, pending] = useActionState<UserAdminState, FormData>(action, undefined);
  const [departmentId, setDepartmentId] = useState("");

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
            placeholder="e.g. Sam Agent"
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
            placeholder="sam@company.com"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="user-password" className={labelClass}>
            Temporary password
          </label>
          <input
            id="user-password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="user-role" className={labelClass}>
            Role
          </label>
          <select id="user-role" name="role" defaultValue="AGENT" className={inputClass}>
            <option value="REQUESTER">Requester</option>
            <option value="AGENT">Agent</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="user-title" className={labelClass}>
          Job title <span className="font-normal text-faint">(optional)</span>
        </label>
        <input
          id="user-title"
          name="jobTitle"
          maxLength={100}
          placeholder="e.g. Support Agent"
          className={inputClass}
        />
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
          <select id="user-team" name="teamId" defaultValue="" className={inputClass}>
            <option value="">No team</option>
            {visibleTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
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
        className="w-full rounded bg-accent-fill px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
