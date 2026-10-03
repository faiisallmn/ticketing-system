"use client";

import { useActionState, useState } from "react";
import { createArticle, updateArticle, type ArticleState } from "./actions";

const inputClass =
  "w-full rounded border border-line bg-surface px-3 py-2 text-sm text-ink outline-none";

type Option = { id: string; name: string };

type Initial = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  categoryId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

export function ArticleForm({
  articleId,
  initial,
  categories,
}: {
  /** Omitted when creating. */
  articleId?: string;
  initial: Initial;
  categories: Option[];
}) {
  const bound = articleId ? updateArticle.bind(null, articleId) : createArticle;
  const [action] = useState(() => bound);
  const [state, formAction, pending] = useActionState<ArticleState, FormData>(action, undefined);

  return (
    <form action={formAction} className="space-y-4 rounded border border-line bg-surface p-6">
      <div className="space-y-1.5">
        <label htmlFor="article-title" className="block text-sm font-medium text-ink">
          Title
        </label>
        <input
          id="article-title"
          name="title"
          required
          maxLength={160}
          defaultValue={initial.title}
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="article-slug" className="block text-sm font-medium text-ink">
            Slug <span className="font-normal text-faint">(optional, auto from title)</span>
          </label>
          <input
            id="article-slug"
            name="slug"
            maxLength={120}
            defaultValue={initial.slug}
            placeholder="e.g. reset-your-password"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="article-category" className="block text-sm font-medium text-ink">
            Category
          </label>
          <select
            id="article-category"
            name="categoryId"
            defaultValue={initial.categoryId}
            className={inputClass}
          >
            <option value="">General</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="article-excerpt" className="block text-sm font-medium text-ink">
          Excerpt <span className="font-normal text-faint">(optional)</span>
        </label>
        <input
          id="article-excerpt"
          name="excerpt"
          maxLength={300}
          defaultValue={initial.excerpt}
          placeholder="One-line summary shown in the list"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="article-content" className="block text-sm font-medium text-ink">
          Content (Markdown)
        </label>
        <textarea
          id="article-content"
          name="content"
          required
          rows={14}
          defaultValue={initial.content}
          placeholder={"# Heading\n\nWrite the guide here. **Bold**, lists, `code` and tables work."}
          className={`${inputClass} resize-y tabular-nums text-[13px] leading-relaxed`}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="article-status" className="block text-sm font-medium text-ink">
          Status
        </label>
        <select id="article-status" name="status" defaultValue={initial.status} className={inputClass}>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
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
        className="rounded bg-accent-fill px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : articleId ? "Save changes" : "Create article"}
      </button>
    </form>
  );
}
