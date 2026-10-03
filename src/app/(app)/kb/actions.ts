"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requirePermission, requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { createArticleSchema } from "@/lib/tickets/validation";

export type ArticleState = { error?: string } | undefined;

async function uniqueArticleSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = base;
  let counter = 2;
  for (;;) {
    const existing = await db.article.findUnique({ where: { slug } });
    if (!existing || existing.id === ignoreId) return slug;
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

export async function createArticle(
  _prev: ArticleState,
  formData: FormData,
): Promise<ArticleState> {
  const user = await requirePermission("kb:manage");

  const parsed = createArticleSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    excerpt: formData.get("excerpt"),
    content: formData.get("content"),
    categoryId: formData.get("categoryId"),
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (parsed.data.categoryId) {
    const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } });
    if (!category) return { error: "Selected category does not exist." };
  }

  const slug = await uniqueArticleSlug(parsed.data.slug ?? slugify(parsed.data.title));
  const now = new Date();

  await db.article.create({
    data: {
      title: parsed.data.title,
      slug,
      excerpt: parsed.data.excerpt,
      content: parsed.data.content,
      categoryId: parsed.data.categoryId,
      status: parsed.data.status,
      authorId: user.id,
      publishedAt: parsed.data.status === "PUBLISHED" ? now : null,
    },
  });

  revalidatePath("/kb");
}

export async function updateArticle(
  id: string,
  _prev: ArticleState,
  formData: FormData,
): Promise<ArticleState> {
  await requirePermission("kb:manage");

  const existing = await db.article.findUnique({ where: { id } });
  if (!existing) notFound();

  const parsed = createArticleSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    excerpt: formData.get("excerpt"),
    content: formData.get("content"),
    categoryId: formData.get("categoryId"),
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (parsed.data.categoryId) {
    const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } });
    if (!category) return { error: "Selected category does not exist." };
  }

  const slug = await uniqueArticleSlug(parsed.data.slug ?? slugify(parsed.data.title), id);

  await db.article.update({
    where: { id },
    data: {
      title: parsed.data.title,
      slug,
      excerpt: parsed.data.excerpt,
      content: parsed.data.content,
      categoryId: parsed.data.categoryId,
      status: parsed.data.status,
      publishedAt:
        parsed.data.status === "PUBLISHED"
          ? (existing.publishedAt ?? new Date())
          : existing.status === "PUBLISHED"
            ? existing.publishedAt
            : null,
    },
  });

  revalidatePath("/kb");
  revalidatePath(`/kb/${slug}`);
}

export async function deleteArticle(formData: FormData): Promise<void> {
  await requirePermission("kb:manage");
  const id = String(formData.get("id") ?? "");
  if (id === "") return;
  await db.article.delete({ where: { id } });
  revalidatePath("/kb");
}

export async function voteArticle(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const helpful = formData.get("vote") === "up";
  if (id === "") return;

  const article = await db.article.findFirst({ where: { id, status: "PUBLISHED" } });
  if (!article) notFound();

  const existing = await db.articleFeedback.findUnique({
    where: { articleId_userId: { articleId: id, userId: user.id } },
  });

  if (!existing) {
    await db.$transaction([
      db.articleFeedback.create({ data: { articleId: id, userId: user.id, isHelpful: helpful } }),
      db.article.update({
        where: { id },
        data: helpful ? { helpful: { increment: 1 } } : { unhelpful: { increment: 1 } },
      }),
    ]);
  } else if (existing.isHelpful !== helpful) {
    await db.$transaction([
      db.articleFeedback.update({ where: { id: existing.id }, data: { isHelpful: helpful } }),
      db.article.update({
        where: { id },
        data: helpful
          ? { helpful: { increment: 1 }, unhelpful: { decrement: 1 } }
          : { helpful: { decrement: 1 }, unhelpful: { increment: 1 } },
      }),
    ]);
  }

  revalidatePath(`/kb/${article.slug}`);
}
