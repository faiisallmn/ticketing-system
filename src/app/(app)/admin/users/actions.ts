"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "@/lib/tickets/validation";

export type UserAdminState = { error?: string } | undefined;

const PATH = "/admin/users";

/** Keep department/team consistent: a team implies its department. */
async function resolvePlacement(departmentId: string | null, teamId: string | null) {
  let team: { id: string; departmentId: string } | null = null;
  if (teamId) {
    team = await db.team.findUnique({ where: { id: teamId }, select: { id: true, departmentId: true } });
    if (!team) return { error: "Selected team does not exist." } as const;
  }
  if (departmentId) {
    const department = await db.department.findUnique({ where: { id: departmentId } });
    if (!department) return { error: "Selected department does not exist." } as const;
    if (team && team.departmentId !== departmentId) {
      return { error: "That team does not belong to the selected department." } as const;
    }
    return { departmentId, teamId: teamId ?? null };
  }
  return { departmentId: team ? team.departmentId : null, teamId: teamId ?? null };
}

export async function createUser(
  _prev: UserAdminState,
  formData: FormData,
): Promise<UserAdminState> {
  await requirePermission("user:manage");

  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") || undefined,
    jobTitle: formData.get("jobTitle"),
    departmentId: formData.get("departmentId"),
    teamId: formData.get("teamId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with this email already exists." };

  const placement = await resolvePlacement(parsed.data.departmentId, parsed.data.teamId);
  if ("error" in placement) return { error: placement.error };

  await db.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      role: parsed.data.role,
      jobTitle: parsed.data.jobTitle,
      departmentId: placement.departmentId,
      teamId: placement.teamId,
    },
  });

  revalidatePath(PATH);
  redirect(PATH);
}

export async function updateUser(
  id: string,
  _prev: UserAdminState,
  formData: FormData,
): Promise<UserAdminState> {
  const actor = await requirePermission("user:manage");

  const target = await db.user.findUnique({ where: { id } });
  if (!target) notFound();

  const parsed = updateUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    jobTitle: formData.get("jobTitle"),
    departmentId: formData.get("departmentId"),
    teamId: formData.get("teamId"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Nobody edits themselves out of power through this page.
  if (target.id === actor.id) {
    if (parsed.data.role !== target.role) {
      return { error: "You cannot change your own role." };
    }
    if (!parsed.data.isActive) {
      return { error: "You cannot deactivate your own account." };
    }
  }

  // The system always keeps at least one active administrator.
  if (
    target.role === "ADMIN" &&
    target.isActive &&
    (parsed.data.role !== "ADMIN" || !parsed.data.isActive)
  ) {
    const remaining = await db.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: target.id } },
    });
    if (remaining === 0) {
      return { error: "The system needs at least one active administrator." };
    }
  }

  const email = parsed.data.email.toLowerCase();
  if (email !== target.email) {
    const taken = await db.user.findUnique({ where: { email } });
    if (taken) return { error: "An account with this email already exists." };
  }

  const placement = await resolvePlacement(parsed.data.departmentId, parsed.data.teamId);
  if ("error" in placement) return { error: placement.error };

  await db.user.update({
    where: { id: target.id },
    data: {
      name: parsed.data.name,
      email,
      role: parsed.data.role,
      jobTitle: parsed.data.jobTitle,
      departmentId: placement.departmentId,
      teamId: placement.teamId,
      isActive: parsed.data.isActive,
    },
  });

  revalidatePath(PATH);
  revalidatePath(`/admin/users/${target.id}`);
}

export async function resetUserPassword(
  id: string,
  _prev: UserAdminState,
  formData: FormData,
): Promise<UserAdminState> {
  await requirePermission("user:manage");

  const target = await db.user.findUnique({ where: { id } });
  if (!target) notFound();

  const parsed = resetPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password." };
  }

  // Bumping the version signs them out everywhere, including this device.
  await db.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      sessionVersion: { increment: 1 },
    },
  });

  revalidatePath(`/admin/users/${target.id}`);
}

export async function deleteUserAccount(formData: FormData): Promise<void> {
  const actor = await requirePermission("user:manage");
  const id = String(formData.get("id") ?? "");
  if (id === "") return;

  const target = await db.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: { requestedTickets: true, assignedTickets: true, comments: true },
      },
    },
  });
  if (!target) notFound();
  if (target.id === actor.id) return;

  // History must stay attributable: only accounts that never participated
  // can be deleted. Deactivate everyone else.
  const touchedAnything =
    target._count.requestedTickets > 0 ||
    target._count.assignedTickets > 0 ||
    target._count.comments > 0;
  if (touchedAnything) return;

  if (target.role === "ADMIN") {
    const remaining = await db.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: target.id } },
    });
    if (remaining === 0) return;
  }

  // Clean up records that would otherwise dangle.
  await db.$transaction([
    db.notification.deleteMany({ where: { userId: target.id } }),
    db.cannedResponse.deleteMany({ where: { createdById: target.id } }),
    db.apiKey.deleteMany({ where: { userId: target.id } }),
    db.savedFilter.deleteMany({ where: { userId: target.id } }),
    db.articleFeedback.deleteMany({ where: { userId: target.id } }),
    db.user.delete({ where: { id: target.id } }),
  ]);

  revalidatePath(PATH);
  redirect(PATH);
}
