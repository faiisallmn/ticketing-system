"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { parseHm } from "@/lib/sla/business-time";
import {
  createBusinessHoursSchema,
  createHolidaySchema,
  createSlaPolicySchema,
} from "@/lib/tickets/validation";

export type SlaAdminState = { error?: string } | undefined;

const PATH = "/admin/sla";

function validTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export async function createBusinessHours(
  _prev: SlaAdminState,
  formData: FormData,
): Promise<SlaAdminState> {
  await requirePermission("sla:manage");

  const parsed = createBusinessHoursSchema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
    workdays: formData.getAll("workdays"),
    workStart: formData.get("workStart"),
    workEnd: formData.get("workEnd"),
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (!validTimeZone(parsed.data.timezone)) {
    return { error: "Unknown timezone — use an IANA name like Asia/Jakarta." };
  }

  let start: number;
  let end: number;
  try {
    start = parseHm(parsed.data.workStart);
    end = parseHm(parsed.data.workEnd);
  } catch {
    return { error: "Working hours must be valid HH:MM values." };
  }
  if (start >= end) return { error: "Work start must be before work end." };

  const workdays = [...new Set(parsed.data.workdays)].sort((a, b) => a - b);

  await db.$transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.businessHours.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    await tx.businessHours.create({
      data: {
        name: parsed.data.name,
        timezone: parsed.data.timezone,
        workdays,
        workStart: parsed.data.workStart,
        workEnd: parsed.data.workEnd,
        isDefault: parsed.data.isDefault,
      },
    });
  });

  revalidatePath(PATH);
}

export async function setDefaultBusinessHours(formData: FormData): Promise<void> {
  await requirePermission("sla:manage");
  const id = String(formData.get("id") ?? "");
  if (id === "") return;

  await db.$transaction(async (tx) => {
    await tx.businessHours.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    await tx.businessHours.update({ where: { id }, data: { isDefault: true, isActive: true } });
  });
  revalidatePath(PATH);
}

export async function toggleBusinessHours(formData: FormData): Promise<void> {
  await requirePermission("sla:manage");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (id === "") return;
  await db.businessHours.update({ where: { id }, data: { isActive: active } });
  revalidatePath(PATH);
}

export async function deleteBusinessHours(formData: FormData): Promise<void> {
  await requirePermission("sla:manage");
  const id = String(formData.get("id") ?? "");
  if (id === "") return;
  const inUse = await db.sLAPolicy.count({ where: { businessHoursId: id } });
  if (inUse > 0) return;
  await db.businessHours.delete({ where: { id } });
  revalidatePath(PATH);
}

export async function createHoliday(
  _prev: SlaAdminState,
  formData: FormData,
): Promise<SlaAdminState> {
  await requirePermission("sla:manage");

  const parsed = createHolidaySchema.safeParse({
    name: formData.get("name"),
    date: formData.get("date"),
    isRecurring: formData.get("isRecurring") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await db.holiday.create({
    data: {
      name: parsed.data.name,
      date: new Date(`${parsed.data.date}T00:00:00Z`),
      isRecurring: parsed.data.isRecurring,
    },
  });

  revalidatePath(PATH);
}

export async function deleteHoliday(formData: FormData): Promise<void> {
  await requirePermission("sla:manage");
  const id = String(formData.get("id") ?? "");
  if (id === "") return;
  await db.holiday.delete({ where: { id } });
  revalidatePath(PATH);
}

export async function createSlaPolicy(
  _prev: SlaAdminState,
  formData: FormData,
): Promise<SlaAdminState> {
  await requirePermission("sla:manage");

  const parsed = createSlaPolicySchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    priority: formData.get("priority"),
    firstResponseMinutes: formData.get("firstResponseMinutes"),
    resolutionMinutes: formData.get("resolutionMinutes"),
    businessHoursId: formData.get("businessHoursId"),
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const [category, calendar] = await Promise.all([
    parsed.data.categoryId
      ? db.category.findUnique({ where: { id: parsed.data.categoryId } })
      : Promise.resolve(null),
    db.businessHours.findUnique({ where: { id: parsed.data.businessHoursId } }),
  ]);
  if (parsed.data.categoryId && !category) return { error: "Selected category does not exist." };
  if (!calendar) return { error: "Selected calendar does not exist." };

  await db.$transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.sLAPolicy.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    await tx.sLAPolicy.create({
      data: {
        name: parsed.data.name,
        categoryId: parsed.data.categoryId,
        priority: parsed.data.priority,
        firstResponseMinutes: parsed.data.firstResponseMinutes,
        resolutionMinutes: parsed.data.resolutionMinutes,
        businessHoursId: parsed.data.businessHoursId,
        isDefault: parsed.data.isDefault,
        isActive: true,
      },
    });
  });

  revalidatePath(PATH);
}

export async function toggleSlaPolicy(formData: FormData): Promise<void> {
  await requirePermission("sla:manage");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (id === "") return;
  await db.sLAPolicy.update({ where: { id }, data: { isActive: active } });
  revalidatePath(PATH);
}

export async function deleteSlaPolicy(formData: FormData): Promise<void> {
  await requirePermission("sla:manage");
  const id = String(formData.get("id") ?? "");
  if (id === "") return;
  await db.sLAPolicy.delete({ where: { id } });
  revalidatePath(PATH);
}
