import "server-only";

import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/rbac";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

async function loadUser(id: string, sessionVersion: number) {
  return db.user.findFirst({
    where: {
      id,
      isActive: true,
      sessionVersion,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      jobTitle: true,
      isActive: true,
      sessionVersion: true,
      departmentId: true,
      teamId: true,
      department: { select: { id: true, name: true, slug: true } },
      team: { select: { id: true, name: true, slug: true } },
    },
  });
}

/**
 * Resolves the signed-in user from the session cookie, then re-reads the row
 * from the database so role changes, deactivation and session revocation take
 * effect immediately instead of waiting for the token to expire.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return loadUser(id, session.user.sessionVersion);
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(permission: Permission) {
  const user = await requireUser();
  if (!can(user.role, permission)) forbidden();
  return user;
}

export async function requireAnyPermission(...permissions: Permission[]) {
  const user = await requireUser();
  if (!permissions.some((permission) => can(user.role, permission))) forbidden();
  return user;
}
