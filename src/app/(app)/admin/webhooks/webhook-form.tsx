"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createWebhook, type WebhookAdminState } from "./actions";
import { WEBHOOK_EVENT_LABELS } from "@/lib/labels";
import type { WebhookEventType } from "@/generated/prisma/enums";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

const EVENTS: WebhookEventType[] = [
  "TICKET_CREATED",
  "TICKET_UPDATED",
  "COMMENT_ADDED",
  "SLA_BREACHED",
  "ESCALATED",
];

export function WebhookForm() {
  const [action] = useState(() => createWebhook);
  const [state, formAction, pending] = useActionState<WebhookAdminState, FormData>(action, undefined);
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
      <h2 className="text-sm font-semibold text-ink">New endpoint</h2>

      <div className="space-y-1.5">
        <label htmlFor="webhook-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="webhook-name"
          name="name"
          required
          maxLength={80}
          placeholder="e.g. #support-alerts"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="webhook-url" className="block text-sm font-medium text-ink">
          URL
        </label>
        <input
          id="webhook-url"
          name="url"
          type="url"
          required
          placeholder="https://…"
          className={inputClass}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="block text-sm font-medium text-ink">Events</legend>
        <div className="space-y-1.5">
          {EVENTS.map((event) => (
            <label key={event} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="events"
                value={event}
                defaultChecked={event === "TICKET_CREATED" || event === "SLA_BREACHED"}
                className="h-4 w-4 accent-accent"
              />
              {WEBHOOK_EVENT_LABELS[event]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="webhook-format" className="block text-sm font-medium text-ink">
            Format
          </label>
          <select id="webhook-format" name="format" defaultValue="JSON" className={inputClass}>
            <option value="JSON">JSON</option>
            <option value="SLACK">Slack text</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="webhook-secret" className="block text-sm font-medium text-ink">
            Secret <span className="font-normal text-faint">(optional)</span>
          </label>
          <input
            id="webhook-secret"
            name="secret"
            maxLength={200}
            placeholder="Auto-generated"
            className={inputClass}
          />
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
        {pending ? "Creating…" : "Create endpoint"}
      </button>
    </form>
  );
}
