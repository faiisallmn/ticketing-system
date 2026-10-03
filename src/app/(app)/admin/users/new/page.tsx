import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { UserCreateForm } from "./user-create-form";

export const metadata: Metadata = {
  title: "New user",
};

export default async function NewUserPage() {
  await requirePermission("user:manage");

  const [departments, teams] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.team.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, departmentId: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">New user</h1>
        <p className="mt-1 text-sm text-muted">
          They sign in with this email and the temporary password.
        </p>
      </div>

      <UserCreateForm departments={departments} teams={teams} />
    </div>
  );
}
