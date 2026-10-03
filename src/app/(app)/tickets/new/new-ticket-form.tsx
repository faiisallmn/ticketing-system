"use client";

import { useActionState, useState } from "react";
import { createTicket, type ActionState } from "@/app/(app)/tickets/actions";
import { RelatedArticles } from "./related-articles";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint";

const labelClass = "block text-[13px] font-medium";

type Option = { id: string; name: string };

type Props = {
  isStaff: boolean;
  categories: Option[];
  tags: Option[];
  departments: Option[];
  teams: Array<Option & { departmentId: string }>;
  staff: Option[];
  requesters: Option[];
};

export function NewTicketForm({
  isStaff,
  categories,
  tags,
  departments,
  teams,
  staff,
  requesters,
}: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createTicket,
    undefined,
  );
  const [departmentId, setDepartmentId] = useState("");
  const [title, setTitle] = useState("");

  const visibleTeams = departmentId ? teams.filter((team) => team.departmentId === departmentId) : teams;

  return (
    <form action={formAction} className="space-y-5 rounded border border-line bg-surface p-6">
      <div className="space-y-1.5">
        <label htmlFor="title" className={labelClass}>
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Brief summary of the issue"
          className={inputClass}
        />
      </div>

      <RelatedArticles title={title} />

      <div className="space-y-1.5">
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={6}
          placeholder="Steps to reproduce, expected vs actual behaviour, affected users…"
          className={`${inputClass} resize-y`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <select id="priority" name="priority" defaultValue="MEDIUM" className={inputClass}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="severity" className={labelClass}>
            Severity
          </label>
          <select id="severity" name="severity" defaultValue="MEDIUM" className={inputClass}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="categoryId" className={labelClass}>
            Category
          </label>
          <select id="categoryId" name="categoryId" defaultValue="" className={inputClass}>
            <option value="">Uncategorized</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="departmentId" className={labelClass}>
            Department
          </label>
          <select
            id="departmentId"
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
      </div>

      {tags.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className={labelClass}>Tags</legend>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <label
                key={tag.id}
                className="flex cursor-pointer items-center gap-1.5 rounded border border-line px-3 py-1 text-xs text-muted transition has-checked:border-accent has-checked:bg-accent-soft has-checked:text-ink"
              >
                <input type="checkbox" name="tagIds" value={tag.id} className="sr-only" />
                {tag.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {isStaff ? (
        <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="teamId" className={labelClass}>
              Team
            </label>
            <select id="teamId" name="teamId" defaultValue="" className={inputClass}>
              <option value="">No team</option>
              {visibleTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="assigneeId" className={labelClass}>
              Assignee
            </label>
            <select id="assigneeId" name="assigneeId" defaultValue="" className={inputClass}>
              <option value="">Unassigned</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="requesterId" className={labelClass}>
              Requester
            </label>
            <select id="requesterId" name="requesterId" defaultValue="" className={inputClass}>
              <option value="">Myself</option>
              {requesters.map((requester) => (
                <option key={requester.id} value={requester.id}>
                  {requester.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

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
        className="h-9 w-full rounded bg-accent-fill px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create ticket"}
      </button>
    </form>
  );
}
