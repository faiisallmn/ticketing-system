"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { API_SCOPES, generateApiKey, hashApiKey } from "@/lib/api/auth";

const PATH = "/admin/api-keys";

const createKeySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  userId: z.string().min(1, "Pick an owner."),
  scopes: z.array(z.enum(API_SCOPES)).min(1, "Pick at least one scope."),
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date.")
    .nullish()
    .transform((value) => {
      if (!value) return null;
      const date = new Date(`${value}T23:59:59`);
      return Number.isNaN(date.getTime()) ? null : date;
    }),
});

export type ApiKeyState = { error?: string; key?: string; prefix?: string } | undefined;

export async function createApiKey(
  _prev: ApiKeyState,
  formData: FormData,
): Promise<ApiKeyState> {
  await requirePermission("api:manage");

  const parsed = createKeySchema.safeParse({
    name: formData.get("name"),
    userId: formData.get("userId"),
    scopes: formData.getAll("scopes").map(String),
    expiresAt: formData.get("expiresAt") || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (parsed.data.expiresAt && parsed.data.expiresAt <= new Date()) {
    return { error: "Expiry must be in the future." };
  }

  const owner = await db.user.findFirst({
    where: { id: parsed.data.userId, isActive: true },
  });
  if (!owner) return { error: "Owner must be an active user." };

  const { raw, prefix } = generateApiKey();
  await db.apiKey.create({
    data: {
      name: parsed.data.name,
      prefix,
      keyHash: hashApiKey(raw),
      userId: owner.id,
      scopes: [...parsed.data.scopes],
      expiresAt: parsed.data.expiresAt,
    },
  });

  revalidatePath(PATH);
  // Shown exactly once — the raw secret is never stored.
  return { key: raw, prefix };
}

export async function revokeApiKey(formData: FormData): Promise<void> {
  await requirePermission("api:manage");
  const id = String(formData.get("id") ?? "");
  if (id === "") return;
  await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath(PATH);
}
