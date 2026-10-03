"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { createWebhookSchema } from "@/lib/tickets/validation";

export type WebhookAdminState = { error?: string } | undefined;

const PATH = "/admin/webhooks";

export async function createWebhook(
  _prev: WebhookAdminState,
  formData: FormData,
): Promise<WebhookAdminState> {
  await requirePermission("webhook:manage");

  const parsed = createWebhookSchema.safeParse({
    name: formData.get("name"),
    url: formData.get("url"),
    events: formData.getAll("events").map(String),
    format: formData.get("format") || undefined,
    secret: formData.get("secret"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await db.webhook.create({
    data: {
      name: parsed.data.name,
      url: parsed.data.url,
      events: [...parsed.data.events],
      format: parsed.data.format,
      secret: parsed.data.secret ?? randomBytes(32).toString("hex"),
      isActive: true,
    },
  });

  revalidatePath(PATH);
}

export async function toggleWebhook(formData: FormData): Promise<void> {
  await requirePermission("webhook:manage");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (id === "") return;
  await db.webhook.update({ where: { id }, data: { isActive: active } });
  revalidatePath(PATH);
}

export async function deleteWebhook(formData: FormData): Promise<void> {
  await requirePermission("webhook:manage");
  const id = String(formData.get("id") ?? "");
  if (id === "") return;
  await db.webhook.delete({ where: { id } });
  revalidatePath(PATH);
}

export async function regenerateWebhookSecret(formData: FormData): Promise<void> {
  await requirePermission("webhook:manage");
  const id = String(formData.get("id") ?? "");
  if (id === "") return;
  await db.webhook.update({
    where: { id },
    data: { secret: randomBytes(32).toString("hex") },
  });
  revalidatePath(PATH);
}
