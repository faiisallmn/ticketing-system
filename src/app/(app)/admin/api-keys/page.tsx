import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { formatDateTime, timeAgo } from "@/lib/format";
import { revokeApiKey } from "./actions";
import { ApiKeyForm } from "./api-key-form";

export const metadata: Metadata = {
  title: "API keys",
};

export default async function ApiKeysPage() {
  await requirePermission("api:manage");

  const [keys, users] = await Promise.all([
    db.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    }),
    db.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">API keys</h1>
          <p className="mt-1 text-sm text-muted">
            Keys act with their owner&apos;s permissions. Spec:{" "}
            <Link href="/api/v1/openapi.json" className="font-medium text-ink hover:underline">
              /api/v1/openapi.json
            </Link>
          </p>
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {keys.length === 0 ? (
            <p className="rounded border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted">
              No API keys yet.
            </p>
          ) : (
            keys.map((key) => (
              <article
                key={key.id}
                className="rounded border border-line bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {key.name}
                      {key.revokedAt ? (
                        <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                          Revoked
                        </span>
                      ) : key.expiresAt && key.expiresAt <= new Date() ? (
                        <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                          Expired
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 tabular-nums text-xs text-muted">
                      {key.prefix}… · {key.user.name} ({key.user.email})
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Scopes: {key.scopes.join(", ") || "none"} · created{" "}
                      {timeAgo(key.createdAt)}
                      {key.lastUsedAt ? ` · last used ${timeAgo(key.lastUsedAt)}` : " · never used"}
                      {key.expiresAt ? ` · expires ${formatDateTime(key.expiresAt)}` : ""}
                    </p>
                  </div>
                  {!key.revokedAt ? (
                    <form action={revokeApiKey} className="shrink-0">
                      <input type="hidden" name="id" value={key.id} />
                      <button
                        type="submit"
                        className="rounded border border-line px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger-soft"
                      >
                        Revoke
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>

        <ApiKeyForm users={users} />
      </section>
    </div>
  );
}
