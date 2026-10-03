"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { signOut } from "@/lib/auth";
import { changePasswordSchema, updateProfileSchema } from "@/lib/tickets/validation";

export type SettingsState = { error?: string } | undefined;

export async function updateProfile(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();

  const parsed = updateProfileSchema.safeParse({
    name: formData.get("name"),
    jobTitle: formData.get("jobTitle"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name, jobTitle: parsed.data.jobTitle },
  });

  revalidatePath("/settings");
}

export async function changePassword(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const row = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  const valid = await bcrypt.compare(parsed.data.currentPassword, row.passwordHash);
  if (!valid) {
    return { error: "Current password is incorrect." };
  }

  // Bumping the version signs out every session, so sign out here too and
  // let the user sign back in with the new password.
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.newPassword, 12),
      sessionVersion: { increment: 1 },
    },
  });

  await signOut({ redirectTo: "/login" });
}
