"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { createCategorySchema, createTagSchema } from "@/lib/tickets/validation";

export type AdminActionState = { error?: string } | undefined;

async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let slug = base;
  let counter = 2;
  while (await exists(slug)) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return slug;
}

export async function createCategory(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requirePermission("category:manage");

  const parsed = createCategorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    color: formData.get("color") || undefined,
    departmentId: formData.get("departmentId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (parsed.data.departmentId) {
    const department = await db.department.findUnique({
      where: { id: parsed.data.departmentId },
    });
    if (!department) return { error: "Selected department does not exist." };
  }

  const slug = await uniqueSlug(slugify(parsed.data.name), async (candidate) => {
    const existing = await db.category.findUnique({ where: { slug: candidate } });
    return existing !== null;
  });

  await db.category.create({
    data: {
      name: parsed.data.name,
      slug,
      description: parsed.data.description?.trim() || null,
      color: parsed.data.color,
      departmentId: parsed.data.departmentId,
    },
  });

  revalidatePath("/admin/categories");
}

export async function setCategoryActive(formData: FormData): Promise<void> {
  await requirePermission("category:manage");

  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (id === "") return;

  await db.category.update({ where: { id }, data: { isActive: active } });
  revalidatePath("/admin/categories");
}

export async function createTag(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requirePermission("category:manage");

  const parsed = createTagSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const slug = await uniqueSlug(slugify(parsed.data.name), async (candidate) => {
    const existing = await db.tag.findUnique({ where: { slug: candidate } });
    return existing !== null;
  });

  await db.tag.create({
    data: { name: parsed.data.name, slug, color: parsed.data.color },
  });

  revalidatePath("/admin/categories");
}

export async function deleteTag(formData: FormData): Promise<void> {
  await requirePermission("category:manage");

  const id = String(formData.get("id") ?? "");
  if (id === "") return;

  const inUse = await db.ticketTag.count({ where: { tagId: id } });
  if (inUse > 0) return;

  await db.tag.delete({ where: { id } });
  revalidatePath("/admin/categories");
}
