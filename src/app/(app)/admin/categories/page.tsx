import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { deleteTag, setCategoryActive } from "./actions";
import { CategoryForm } from "./category-form";
import { TagForm } from "./tag-form";

export const metadata: Metadata = {
  title: "Categories & tags",
};

export default async function CategoriesPage() {
  await requirePermission("category:manage");

  const [categories, tags, departments, tagUsage] = await Promise.all([
    db.category.findMany({
      orderBy: { name: "asc" },
      include: {
        department: { select: { name: true } },
        _count: { select: { tickets: true } },
      },
    }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.ticketTag.groupBy({ by: ["tagId"], _count: { _all: true } }),
  ]);

  const usageByTag = new Map(tagUsage.map((row) => [row.tagId, row._count._all]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Categories & tags</h1>
        <p className="mt-1 text-sm text-muted">
          Organise incoming tickets so they can be routed and reported on.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Categories</h2>
          {categories.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No categories yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded border border-line">
              {categories.map((category) => (
                <li key={category.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {category.name}
                        {!category.isActive ? (
                          <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted">
                            Disabled
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {category.department?.name ?? "All departments"} · {category._count.tickets}{" "}
                        {category._count.tickets === 1 ? "ticket" : "tickets"}
                      </p>
                    </div>
                  </div>
                  <form action={setCategoryActive} className="shrink-0">
                    <input type="hidden" name="id" value={category.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={category.isActive ? "false" : "true"}
                    />
                    <button
                      type="submit"
                      className="rounded border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sunken"
                    >
                      {category.isActive ? "Disable" : "Enable"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>

        <CategoryForm departments={departments} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Tags</h2>
          {tags.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No tags yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded border border-line">
              {tags.map((tag) => {
                const usedBy = usageByTag.get(tag.id) ?? 0;
                return (
                  <li key={tag.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{tag.name}</p>
                        <p className="text-xs text-muted">
                          {usedBy} {usedBy === 1 ? "ticket" : "tickets"}
                        </p>
                      </div>
                    </div>
                    {usedBy === 0 ? (
                      <form action={deleteTag} className="shrink-0">
                        <input type="hidden" name="id" value={tag.id} />
                        <button
                          type="submit"
                          className="rounded border border-line px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger-soft"
                        >
                          Delete
                        </button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <TagForm />
      </section>
    </div>
  );
}
