import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { CannedEditForm } from "./canned-edit-form";

export const metadata: Metadata = {
  title: "Edit reply",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CannedEditPage({ params }: Props) {
  const { id } = await params;
  const user = await requirePermission("canned:manage");

  const [reply, teams, categories] = await Promise.all([
    db.cannedResponse.findUnique({ where: { id } }),
    db.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!reply) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Edit reply</h1>
        <p className="mt-1 text-sm text-muted">
          Used {reply.usageCount} {reply.usageCount === 1 ? "time" : "times"} so far.
        </p>
      </div>

      <CannedEditForm
        reply={reply}
        teams={teams}
        categories={categories}
        canPickAnyTeam={user.role === "ADMIN" || user.role === "MANAGER"}
      />
    </div>
  );
}
