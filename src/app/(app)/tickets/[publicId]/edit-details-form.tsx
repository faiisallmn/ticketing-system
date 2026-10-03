"use client";

import { useActionState, useState } from "react";
import { updateTicketDetails, type ActionState } from "@/app/(app)/tickets/actions";

type Option = { id: string; name: string };

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-faint";

export function EditDetailsForm({
  ticketId,
  current,
  categories,
  departments,
  tags,
}: {
  ticketId: string;
  current: {
    title: string;
    description: string;
    categoryId: string | null;
    departmentId: string | null;
    tagIds: string[];
  };
  categories: Option[];
  departments: Option[];
  tags: Option[];
}) {
  const [action] = useState(() => updateTicketDetails.bind(null, ticketId));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);

  return (
    <details className="border-t border-line pt-4">
      <summary className="cursor-pointer text-sm font-medium text-muted transition hover:text-ink">
        Edit title, description, category and tags
      </summary>

      <form action={formAction} className="space-y-4 pt-4">
        <div className="space-y-1.5">
          <label htmlFor={`title-${ticketId}`} className="block text-[13px] font-medium">
            Title
          </label>
          <input
            id={`title-${ticketId}`}
            name="title"
            required
            maxLength={200}
            defaultValue={current.title}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor={`description-${ticketId}`}
            className="block text-[13px] font-medium"
          >
            Description
          </label>
          <textarea
            id={`description-${ticketId}`}
            name="description"
            required
            rows={5}
            defaultValue={current.description}
            className={`${inputClass} max-w-[72ch] resize-y leading-[22px]`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor={`category-${ticketId}`}
              className="block text-[13px] font-medium"
            >
              Category
            </label>
            <select
              id={`category-${ticketId}`}
              name="categoryId"
              defaultValue={current.categoryId ?? ""}
              className={inputClass}
            >
              <option value="">Uncategorized</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={`department-${ticketId}`}
              className="block text-[13px] font-medium"
            >
              Department
            </label>
            <select
              id={`department-${ticketId}`}
              name="departmentId"
              defaultValue={current.departmentId ?? ""}
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
            <legend className="block text-[13px] font-medium">Tags</legend>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex cursor-pointer items-center gap-1.5 rounded border border-line px-3 py-1 text-xs text-muted transition has-checked:border-accent has-checked:bg-accent-soft has-checked:text-ink"
                >
                  <input
                    type="checkbox"
                    name="tagIds"
                    value={tag.id}
                    defaultChecked={current.tagIds.includes(tag.id)}
                    className="sr-only"
                  />
                  {tag.name}
                </label>
              ))}
            </div>
          </fieldset>
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
          className="h-9 rounded bg-accent-fill px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </details>
  );
}
