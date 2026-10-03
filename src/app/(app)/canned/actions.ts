"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requirePermission, requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { createCannedSchema, updateCannedSchema } from "@/lib/tickets/validation";

export type CannedState = { error?: string } | undefined;

function teamScope(user: { role: string; teamId: string | null }) {
  // Admins and managers see every team-scoped reply; agents see their own.
  if (user.role === "ADMIN" || user.role === "MANAGER") return undefined;
  return user.teamId;
}

/** Replies the composer may offer for a ticket. */
export async function listCannedForTicket(
  ticketCategoryId: string | null,
): Promise<Array<{ id: string; title: string }>> {
  const user = await requireUser();
  if (!can(user.role, "comment:create:public") && !can(user.role, "comment:create:internal")) {
    return [];
  }
  const seeAllScopes = user.role === "ADMIN" || user.role === "MANAGER";

  return db.cannedResponse.findMany({
    where: {
      isActive: true,
      // Admins/managers see every scope; agents see global + their own team.
      ...(seeAllScopes
        ? {}
        : {
            OR: [
              { scope: "GLOBAL" as const },
              ...(user.teamId ? [{ scope: "TEAM" as const, teamId: user.teamId }] : []),
            ],
          }),
      // Prefer replies written for this ticket's category, plus generic ones.
      ...(ticketCategoryId
        ? { OR: [{ categoryId: null }, { categoryId: ticketCategoryId }] }
        : {}),
    },
    orderBy: [{ usageCount: "desc" }, { title: "asc" }],
    take: 20,
    select: { id: true, title: true },
  });
}

/** Returns the body and records usage. */
export async function fetchCannedResponse(
  id: string,
): Promise<{ body?: string; title?: string; error?: string }> {
  const user = await requireUser();
  if (!can(user.role, "comment:create:public") && !can(user.role, "comment:create:internal")) {
    return { error: "Forbidden." };
  }

  const canned = await db.cannedResponse.findFirst({ where: { id, isActive: true } });
  if (!canned) return { error: "Template not found." };

  const teamId = teamScope(user);
  if (canned.scope === "TEAM" && teamId !== undefined && canned.teamId !== teamId) {
    return { error: "Forbidden." };
  }

  await db.cannedResponse.update({
    where: { id: canned.id },
    data: { usageCount: { increment: 1 } },
  });
  return { body: canned.body, title: canned.title };
}

function resolveTeamId(
  scope: "GLOBAL" | "TEAM",
  teamId: string | null,
  user: { role: string; teamId: string | null },
): { ok: true; teamId: string | null } | { ok: false; error: string } {
  if (scope === "GLOBAL") return { ok: true, teamId: null };
  if (user.role === "AGENT") {
    if (!user.teamId) {
      return { ok: false, error: "You need to belong to a team to create team replies." };
    }
    return { ok: true, teamId: user.teamId };
  }
  if (!teamId) return { ok: false, error: "Pick a team for a team-scoped reply." };
  return { ok: true, teamId };
}

export async function createCannedResponse(
  _prev: CannedState,
  formData: FormData,
): Promise<CannedState> {
  const user = await requirePermission("canned:manage");

  const parsed = createCannedSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    shortcut: formData.get("shortcut"),
    scope: formData.get("scope") || undefined,
    teamId: formData.get("teamId"),
    categoryId: formData.get("categoryId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const resolvedTeam = resolveTeamId(parsed.data.scope, parsed.data.teamId, user);
  if (!resolvedTeam.ok) return { error: resolvedTeam.error };
  const teamId = resolvedTeam.teamId;

  if (parsed.data.categoryId) {
    const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } });
    if (!category) return { error: "Selected category does not exist." };
  }
  if (teamId) {
    const team = await db.team.findUnique({ where: { id: teamId } });
    if (!team) return { error: "Selected team does not exist." };
  }

  await db.cannedResponse.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      shortcut: parsed.data.shortcut,
      scope: parsed.data.scope,
      teamId,
      categoryId: parsed.data.categoryId,
      createdById: user.id,
    },
  });

  revalidatePath("/canned");
}

export async function updateCannedResponse(
  id: string,
  _prev: CannedState,
  formData: FormData,
): Promise<CannedState> {
  const user = await requirePermission("canned:manage");

  const existing = await db.cannedResponse.findUnique({ where: { id } });
  if (!existing) notFound();

  const parsed = updateCannedSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    shortcut: formData.get("shortcut"),
    scope: formData.get("scope") || undefined,
    teamId: formData.get("teamId"),
    categoryId: formData.get("categoryId"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const resolvedTeam = resolveTeamId(parsed.data.scope, parsed.data.teamId, user);
  if (!resolvedTeam.ok) return { error: resolvedTeam.error };

  await db.cannedResponse.update({
    where: { id },
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      shortcut: parsed.data.shortcut,
      scope: parsed.data.scope,
      teamId: resolvedTeam.teamId,
      categoryId: parsed.data.categoryId,
      isActive: parsed.data.isActive,
    },
  });

  revalidatePath("/canned");
}

export async function deleteCannedResponse(formData: FormData): Promise<void> {
  await requirePermission("canned:manage");
  const id = String(formData.get("id") ?? "");
  if (id === "") return;
  await db.cannedResponse.delete({ where: { id } });
  revalidatePath("/canned");
}
