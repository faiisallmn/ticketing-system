"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createCategory, type AdminActionState } from "./actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

export function CategoryForm({ departments }: { departments: Array<{ id: string; name: string }> }) {
  const [action] = useState(() => createCategory);
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded border border-line bg-surface p-5"
    >
      <h2 className="text-sm font-semibold text-ink">New category</h2>

      <div className="space-y-1.5">
        <label htmlFor="category-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="category-name"
          name="name"
          required
          maxLength={80}
          placeholder="e.g. Bug, Billing, Access request"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="category-description" className="block text-sm font-medium text-ink">
          Description <span className="font-normal text-faint">(optional)</span>
        </label>
        <input
          id="category-description"
          name="description"
          maxLength={500}
          placeholder="When should this category be used?"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="category-color" className="block text-sm font-medium text-ink">
            Colour
          </label>
          <input
            id="category-color"
            name="color"
            type="color"
            defaultValue="#71717a"
            className="h-9 w-full cursor-pointer rounded border border-line bg-surface px-1"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="category-department" className="block text-sm font-medium text-ink">
            Department
          </label>
          <select id="category-department" name="departmentId" defaultValue="" className={inputClass}>
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
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
        className="w-full rounded bg-accent-fill px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create category"}
      </button>
    </form>
  );
}
