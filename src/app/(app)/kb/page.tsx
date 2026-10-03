import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = {
  title: "Knowledge base",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const inputClass =
  "rounded border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none";

export default async function KnowledgeBasePage({ searchParams }: Props) {
  const user = await requireUser();
  const canManage = can(user.role, "kb:manage");

  const params = await searchParams;
  const q = first(params.q).trim();
  const categoryId = first(params.category);

  const articles = await db.article.findMany({
    where: {
      ...(canManage ? {} : { status: "PUBLISHED" as const }),
      ...(categoryId ? { categoryId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { content: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ views: "desc" }, { updatedAt: "desc" }],
    take: 50,
    include: {
      category: { select: { name: true } },
      author: { select: { name: true } },
    },
  });

  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Knowledge base</h1>
          <p className="mt-1 text-sm text-muted">
            Answers to common questions — check here before filing a ticket.
          </p>
        </div>
        {canManage ? (
          <Link
            href="/kb/new"
            className="shrink-0 rounded bg-accent-fill px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            New article
          </Link>
        ) : null}
      </div>

      <form
        method="get"
        action="/kb"
        className="flex gap-2 rounded border border-line bg-surface p-4"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search articles…"
          className={`${inputClass} min-w-0 flex-1`}
        />
        <select name="category" defaultValue={categoryId} aria-label="Category" className={inputClass}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="shrink-0 rounded bg-accent-fill px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          Search
        </button>
      </form>

      {articles.length === 0 ? (
        <p className="rounded border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          No articles found.
        </p>
      ) : (
        <ul className="space-y-3">
          {articles.map((article) => (
            <li key={article.id}>
              <Link
                href={`/kb/${article.slug}`}
                className="block rounded border border-line bg-surface p-4 transition hover:border-line"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{article.title}</span>
                  {article.status !== "PUBLISHED" ? (
                    <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted">
                      {article.status}
                    </span>
                  ) : null}
                </div>
                {article.excerpt ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{article.excerpt}</p>
                ) : null}
                <p className="mt-2 text-xs tabular-nums text-faint">
                  {article.category?.name ?? "General"} · {article.author.name} ·{" "}
                  {timeAgo(article.updatedAt)} · {article.views}{" "}
                  {article.views === 1 ? "view" : "views"} · {article.helpful} helpful /{" "}
                  {article.unhelpful} not
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
