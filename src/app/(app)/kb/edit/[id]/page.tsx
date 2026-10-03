import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { ArticleForm } from "../../article-form";

export const metadata: Metadata = {
  title: "Edit article",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditArticlePage({ params }: Props) {
  const { id } = await params;
  await requirePermission("kb:manage");

  const [article, categories] = await Promise.all([
    db.article.findUnique({ where: { id } }),
    db.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!article) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Edit article</h1>
        <p className="mt-1 tabular-nums text-xs text-muted">/{article.slug}</p>
      </div>

      <ArticleForm
        articleId={article.id}
        initial={{
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt ?? "",
          content: article.content,
          categoryId: article.categoryId ?? "",
          status: article.status,
        }}
        categories={categories}
      />
    </div>
  );
}
