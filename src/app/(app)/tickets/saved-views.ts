"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";

const ALLOWED_KEYS = [
  "q",
  "status",
  "priority",
  "assignee",
  "unassigned",
  "team",
  "category",
  "tag",
  "department",
  "breached",
  "from",
  "to",
];

export type FilterViewState = { error?: string } | undefined;

export async function saveFilterView(
  _prev: FilterViewState,
  formData: FormData,
): Promise<FilterViewState> {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 60) {
    return { error: "Name must be 2–60 characters." };
  }

  const query: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    const value = formData.get(key);
    if (typeof value === "string" && value.trim() !== "") {
      query[key] = value.trim();
    }
  }
  if (Object.keys(query).length === 0) {
    return { error: "Set at least one filter before saving." };
  }

  const count = await db.savedFilter.count({ where: { userId: user.id } });
  if (count >= 20) {
    return { error: "You already have 20 saved views — delete one first." };
  }

  await db.savedFilter.create({ data: { userId: user.id, name, query } });
  revalidatePath("/tickets");
}

export async function deleteFilterView(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (id === "") return;
  await db.savedFilter.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/tickets");
}
