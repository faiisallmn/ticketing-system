import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { deleteCannedResponse } from "./actions";
import { CannedForm } from "./canned-form";

export const metadata: Metadata = {
  title: "Canned replies",
};

export default async function CannedPage() {
  const user = await requirePermission("canned:manage");

  const [replies, teams, categories] = await Promise.all([
    db.cannedResponse.findMany({
      orderBy: [{ usageCount: "desc" }, { title: "asc" }],
      include: {
        team: { select: { name: true } },
        category: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    db.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const canPickAnyTeam = user.role === "ADMIN" || user.role === "MANAGER";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Canned replies</h1>
        <p className="mt-1 text-sm text-muted">
          Reusable answers agents can insert into ticket replies.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {replies.length === 0 ? (
            <p className="rounded border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted">
              No replies yet.
            </p>
          ) : (
            replies.map((reply) => (
              <article
                key={reply.id}
                className="rounded border border-line bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {reply.title}
                      {!reply.isActive ? (
                        <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted">
                          Disabled
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {reply.scope === "GLOBAL" ? "Everyone" : (reply.team?.name ?? "Team")} ·{" "}
                      {reply.category?.name ?? "Any category"} · used {reply.usageCount}{" "}
                      {reply.usageCount === 1 ? "time" : "times"} · by {reply.createdBy.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Link
                      href={`/canned/${reply.id}`}
                      className="rounded border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sunken"
                    >
                      Edit
                    </Link>
                    <form action={deleteCannedResponse}>
                      <input type="hidden" name="id" value={reply.id} />
                      <button
                        type="submit"
                        className="rounded border border-line px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger-soft"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted">
                  {reply.body}
                </p>
              </article>
            ))
          )}
        </div>

        <CannedForm teams={teams} categories={categories} canPickAnyTeam={canPickAnyTeam} />
      </section>
    </div>
  );
}
