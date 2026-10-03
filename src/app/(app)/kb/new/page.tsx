import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { ArticleForm } from "../article-form";

export const metadata: Metadata = {
  title: "New article",
};

export default async function NewArticlePage() {
  await requirePermission("kb:manage");

  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">New article</h1>
        <p className="mt-1 text-sm text-muted">
          Publish when ready — drafts are only visible to managers.
        </p>
      </div>

      <ArticleForm
        initial={{ title: "", slug: "", excerpt: "", content: "", categoryId: "", status: "DRAFT" }}
        categories={categories}
      />
    </div>
  );
}
