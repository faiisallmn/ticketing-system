"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Suggestion = { title: string; slug: string; excerpt: string | null };

/** Shows help articles matching the ticket title, to deflect solvable issues. */
export function RelatedArticles({ title }: { title: string }) {
  const [articles, setArticles] = useState<Suggestion[] | null>(null);
  const ready = title.trim().length >= 4;

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      const current = title;
      fetch(`/api/kb/suggest?q=${encodeURIComponent(current)}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { articles?: Suggestion[] } | null) => {
          if (payload && Array.isArray(payload.articles) && payload.articles.length > 0) {
            setArticles(payload.articles);
          } else {
            setArticles(null);
          }
        })
        .catch(() => setArticles(null));
    }, 450);
    return () => clearTimeout(timer);
  }, [title, ready]);

  if (!ready || !articles) return null;

  return (
    <div className="rounded border border-line bg-sunken p-4">
      <p className="text-sm font-medium">
        These articles might already solve it. Take a look before filing:
      </p>
      <ul className="mt-2 space-y-1.5">
        {articles.map((article) => (
          <li key={article.slug}>
            <Link
              href={`/kb/${article.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-accent hover:underline"
            >
              {article.title}
            </Link>
            {article.excerpt ? (
              <p className="line-clamp-1 text-xs text-muted">{article.excerpt}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
