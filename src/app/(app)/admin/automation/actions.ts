"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { isAssignableRole } from "@/lib/tickets/access";
import {
  createAssignRuleSchema,
  createEscalationRuleSchema,
} from "@/lib/tickets/validation";

export type AutomationState = { error?: string } | undefined;

const PATH = "/admin/automation";

export async function createAssignRule(
  _prev: AutomationState,
  formData: FormData,
): Promise<AutomationState> {
  await requirePermission("automation:manage");

  const parsed = createAssignRuleSchema.safeParse({
    name: formData.get("name"),
    strategy: formData.get("strategy"),
    categoryId: formData.get("categoryId"),
    teamId: formData.get("teamId"),
    targetTeamId: formData.get("targetTeamId"),
    targetUserId: formData.get("targetUserId"),
    position: formData.get("position") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  if (input.strategy === "CATEGORY" && !input.targetTeamId && !input.targetUserId) {
    return { error: "Category routing needs a target team or person." };
  }

  const [category, team, targetTeam, targetUser] = await Promise.all([
    input.categoryId ? db.category.findUnique({ where: { id: input.categoryId } }) : Promise.resolve(null),
    input.teamId ? db.team.findUnique({ where: { id: input.teamId } }) : Promise.resolve(null),
    input.targetTeamId
      ? db.team.findUnique({ where: { id: input.targetTeamId } })
      : Promise.resolve(null),
    input.targetUserId
      ? db.user.findFirst({ where: { id: input.targetUserId, isActive: true } })
      : Promise.resolve(null),
  ]);

  if (input.categoryId && !category) return { error: "Scope category does not exist." };
  if (input.teamId && !team) return { error: "Scope team does not exist." };
  if (input.targetTeamId && !targetTeam) return { error: "Target team does not exist." };
  if (input.targetUserId && (!targetUser || !isAssignableRole(targetUser.role))) {
    return { error: "Target person must be active staff." };
  }

  await db.autoAssignmentRule.create({
    data: {
      name: input.name,
      strategy: input.strategy,
      categoryId: input.categoryId,
      teamId: input.teamId,
      targetTeamId: input.targetTeamId,
      targetUserId: input.targetUserId,
      position: input.position,
      isActive: true,
    },
  });

  revalidatePath(PATH);
}

export async function toggleAssignRule(formData: FormData): Promise<void> {
  await requirePermission("automation:manage");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (id === "") return;
  await db.autoAssignmentRule.update({ where: { id }, data: { isActive: active } });
  revalidatePath(PATH);
}

export async function deleteAssignRule(formData: FormData): Promise<void> {
  await requirePermission("automation:manage");
  const id = String(formData.get("id") ?? "");
  if (id === "") return;
  await db.autoAssignmentRule.delete({ where: { id } });
  revalidatePath(PATH);
}

export async function createEscalationRule(
  _prev: AutomationState,
  formData: FormData,
): Promise<AutomationState> {
  await requirePermission("automation:manage");

  const parsed = createEscalationRuleSchema.safeParse({
    name: formData.get("name"),
    trigger: formData.get("trigger"),
    thresholdMinutes: formData.get("thresholdMinutes"),
    categoryId: formData.get("categoryId"),
    teamId: formData.get("teamId"),
    priority: formData.get("priority"),
    action: formData.get("action"),
    targetTeamId: formData.get("targetTeamId"),
    newPriority: formData.get("newPriority"),
    cooldownMinutes: formData.get("cooldownMinutes") || undefined,
    position: formData.get("position") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  if (input.action === "REASSIGN_TEAM" && !input.targetTeamId) {
    return { error: "Reassignment needs a target team." };
  }

  const [category, team, targetTeam] = await Promise.all([
    input.categoryId ? db.category.findUnique({ where: { id: input.categoryId } }) : Promise.resolve(null),
    input.teamId ? db.team.findUnique({ where: { id: input.teamId } }) : Promise.resolve(null),
    input.targetTeamId
      ? db.team.findUnique({ where: { id: input.targetTeamId } })
      : Promise.resolve(null),
  ]);

  if (input.categoryId && !category) return { error: "Scope category does not exist." };
  if (input.teamId && !team) return { error: "Scope team does not exist." };
  if (input.targetTeamId && !targetTeam) return { error: "Target team does not exist." };

  await db.escalationRule.create({
    data: {
      name: input.name,
      trigger: input.trigger,
      thresholdMinutes: input.thresholdMinutes,
      categoryId: input.categoryId,
      teamId: input.teamId,
      priority: input.priority,
      action: input.action,
      targetTeamId: input.targetTeamId,
      newPriority: input.newPriority,
      cooldownMinutes: input.cooldownMinutes,
      position: input.position,
      isActive: true,
    },
  });

  revalidatePath(PATH);
}

export async function toggleEscalationRule(formData: FormData): Promise<void> {
  await requirePermission("automation:manage");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (id === "") return;
  await db.escalationRule.update({ where: { id }, data: { isActive: active } });
  revalidatePath(PATH);
}

export async function deleteEscalationRule(formData: FormData): Promise<void> {
  await requirePermission("automation:manage");
  const id = String(formData.get("id") ?? "");
  if (id === "") return;
  await db.escalationRule.delete({ where: { id } });
  revalidatePath(PATH);
}
