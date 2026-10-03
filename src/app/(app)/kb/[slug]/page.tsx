import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { requireUser } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { deleteArticle, voteArticle } from "../actions";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await db.article.findUnique({ where: { slug }, select: { title: true } });
  return { title: article?.title ?? "Article" };
}

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const user = await requireUser();
  const canManage = can(user.role, "kb:manage");

  const article = await db.article.findUnique({
    where: { slug },
    include: {
      category: { select: { name: true } },
      author: { select: { name: true } },
    },
  });

  if (!article) notFound();
  if (article.status !== "PUBLISHED" && !canManage) notFound();

  const [myVote] = await Promise.all([
    db.articleFeedback.findUnique({
      where: { articleId_userId: { articleId: article.id, userId: user.id } },
      select: { isHelpful: true },
    }),
    // Best-effort view counter; a failure here must never break the page.
    db.article
      .update({ where: { id: article.id }, data: { views: { increment: 1 } } })
      .catch(() => null),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/kb" className="text-sm font-medium text-muted transition hover:text-ink">
        Back to knowledge base
      </Link>

      <article className="rounded border border-line bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-faint">
              {article.category?.name ?? "General"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">{article.title}</h1>
            <p className="mt-1 text-xs text-muted">
              By {article.author.name} · updated {formatDateTime(article.updatedAt)} ·{" "}
              {article.views + 1} {article.views + 1 === 1 ? "view" : "views"}
            </p>
          </div>
          {canManage ? (
            <div className="flex shrink-0 gap-1.5">
              <Link
                href={`/kb/edit/${article.id}`}
                className="rounded border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sunken"
              >
                Edit
              </Link>
              <form action={deleteArticle}>
                <input type="hidden" name="id" value={article.id} />
                <button
                  type="submit"
                  className="rounded border border-line px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger-soft"
                >
                  Delete
                </button>
              </form>
            </div>
          ) : null}
        </div>

        <div className="prose mt-6 max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content}</ReactMarkdown>
        </div>

        <div className="mt-8 border-t border-line pt-4">
          <p className="text-sm font-medium text-ink">Was this helpful?</p>
          <div className="mt-2 flex items-center gap-2">
            <form action={voteArticle}>
              <input type="hidden" name="id" value={article.id} />
              <input type="hidden" name="vote" value="up" />
              <button
                type="submit"
                title="Yes, this was helpful"
                className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm transition ${
                  myVote?.isHelpful === true
                    ? "border-line bg-sunken text-st-resolved"
                    : "border-line text-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                <ThumbsUp size={14} strokeWidth={1.5} aria-hidden />
                Yes ({article.helpful})
              </button>
            </form>
            <form action={voteArticle}>
              <input type="hidden" name="id" value={article.id} />
              <input type="hidden" name="vote" value="down" />
              <button
                type="submit"
                title="No, this was not helpful"
                className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm transition ${
                  myVote?.isHelpful === false
                    ? "border-line bg-sunken text-danger"
                    : "border-line text-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                <ThumbsDown size={14} strokeWidth={1.5} aria-hidden />
                No ({article.unhelpful})
              </button>
            </form>
          </div>
        </div>
      </article>
    </div>
  );
}
