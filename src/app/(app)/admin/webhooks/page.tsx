import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { WEBHOOK_EVENT_LABELS } from "@/lib/labels";
import { formatDateTime, timeAgo } from "@/lib/format";
import { deleteWebhook, regenerateWebhookSecret, toggleWebhook } from "./actions";
import { WebhookForm } from "./webhook-form";

export const metadata: Metadata = {
  title: "Webhooks & email",
};

const STATUS_STYLES: Record<string, string> = {
  SENT: "border-line bg-sunken text-st-resolved",
  DELIVERED: "border-line bg-sunken text-st-resolved",
  FAILED: "border-danger/40 bg-danger-soft text-danger",
  PENDING: "border-line bg-warn-soft text-warn",
  SKIPPED: "border-line bg-sunken text-muted",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.PENDING}`}
    >
      {status}
    </span>
  );
}

export default async function WebhooksPage() {
  await requirePermission("webhook:manage");

  const [webhooks, deliveries, emails] = await Promise.all([
    db.webhook.findMany({ orderBy: { name: "asc" } }),
    db.webhookDelivery.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { webhook: { select: { name: true } } },
    }),
    db.outboundEmail.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Webhooks & email</h1>
        <p className="mt-1 text-sm text-muted">
          Push ticket events to Slack, Teams or your own systems. Outbound mail is logged below.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Endpoints</h2>
          {webhooks.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No webhooks yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded border border-line">
              {webhooks.map((hook) => (
                <li key={hook.id} className="px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {hook.name}
                        <span className="ml-2 rounded-full border border-line bg-sunken px-2 py-0.5 text-xs font-medium text-muted">
                          {hook.format}
                        </span>
                        {!hook.isActive ? (
                          <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted">
                            Disabled
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate tabular-nums text-xs text-muted">{hook.url}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {hook.events.map((event) => WEBHOOK_EVENT_LABELS[event]).join(" · ") ||
                          "No events"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <form action={toggleWebhook}>
                        <input type="hidden" name="id" value={hook.id} />
                        <input type="hidden" name="active" value={hook.isActive ? "false" : "true"} />
                        <button
                          type="submit"
                          className="rounded border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sunken"
                        >
                          {hook.isActive ? "Disable" : "Enable"}
                        </button>
                      </form>
                      <form action={deleteWebhook}>
                        <input type="hidden" name="id" value={hook.id} />
                        <button
                          type="submit"
                          className="rounded border border-line px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger-soft"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded border border-line bg-sunken px-2 py-1 tabular-nums text-xs text-muted">
                      {hook.secret}
                    </code>
                    <form action={regenerateWebhookSecret} className="shrink-0">
                      <input type="hidden" name="id" value={hook.id} />
                      <button
                        type="submit"
                        title="Generate a new signing secret"
                        className="rounded border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sunken"
                      >
                        Regenerate secret
                      </button>
                    </form>
                  </div>
                  <p className="mt-1 text-xs text-faint">
                    Sent as X-Webhook-Signature: sha256=&lt;hmac of the raw body&gt;.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <WebhookForm />
      </section>

      <section className="overflow-hidden rounded border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Recent deliveries</h2>
        </div>
        {deliveries.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Nothing delivered yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-sunken text-xs text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Endpoint</th>
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Tries</th>
                <th className="px-5 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="px-5 py-3 font-medium text-ink">{delivery.webhook.name}</td>
                  <td className="px-5 py-3 text-muted">
                    {WEBHOOK_EVENT_LABELS[delivery.event]}
                    {delivery.responseCode ? (
                      <span className="text-faint"> · {delivery.responseCode}</span>
                    ) : null}
                    {delivery.error ? (
                      <span className="block max-w-xs truncate text-xs text-danger" title={delivery.error}>
                        {delivery.error}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill status={delivery.status} />
                  </td>
                  <td className="px-5 py-3 text-muted">{delivery.attempts}</td>
                  <td
                    className="whitespace-nowrap px-5 py-3 text-muted"
                    title={formatDateTime(delivery.createdAt)}
                  >
                    {timeAgo(delivery.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="overflow-hidden rounded border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Recent emails</h2>
        </div>
        {emails.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No emails sent yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-sunken text-xs text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">To</th>
                <th className="px-5 py-3 font-medium">Subject</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {emails.map((email) => (
                <tr key={email.id}>
                  <td className="px-5 py-3 text-muted">{email.to}</td>
                  <td className="max-w-xs px-5 py-3">
                    <p className="truncate font-medium text-ink" title={email.subject}>
                      {email.subject}
                    </p>
                    <p className="text-xs text-muted">{email.template}</p>
                    {email.error ? (
                      <p className="truncate text-xs text-danger" title={email.error}>
                        {email.error}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill status={email.status} />
                  </td>
                  <td
                    className="whitespace-nowrap px-5 py-3 text-muted"
                    title={formatDateTime(email.createdAt)}
                  >
                    {timeAgo(email.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
