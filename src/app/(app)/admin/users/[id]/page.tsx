import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { deleteUserAccount } from "../actions";
import { UserEditForm } from "./user-edit-form";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Edit user",
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditUserPage({ params }: Props) {
  const { id } = await params;
  const actor = await requirePermission("user:manage");

  const [target, departments, teams] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: { requestedTickets: true, assignedTickets: true, comments: true },
        },
      },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.team.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, departmentId: true },
    }),
  ]);

  if (!target) notFound();

  const touchedAnything =
    target._count.requestedTickets > 0 ||
    target._count.assignedTickets > 0 ||
    target._count.comments > 0;
  const isSelf = target.id === actor.id;
  const adminCount = await db.user.count({ where: { role: "ADMIN", isActive: true } });
  const isLastAdmin = target.role === "ADMIN" && target.isActive && adminCount <= 1;
  const canDelete = !isSelf && !touchedAnything && !isLastAdmin;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="text-sm font-medium text-muted transition hover:text-ink"
        >
          Back to users
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Edit user</h1>
        <p className="mt-1 text-sm text-muted">
          Member since {formatDateTime(target.createdAt)}
          {target.lastLoginAt ? ` · last sign-in ${formatDateTime(target.lastLoginAt)}` : ""}
        </p>
      </div>

      {isSelf ? (
        <p className="rounded border border-line bg-accent-soft px-4 py-3 text-sm text-ink">
          This is your own account — you can change the name and email here, but not your own
          role or status. Personal details live under{" "}
          <Link href="/settings" className="font-medium underline">Settings</Link>.
        </p>
      ) : null}

      <UserEditForm
        userId={target.id}
        initial={{
          name: target.name,
          email: target.email,
          role: target.role,
          jobTitle: target.jobTitle ?? "",
          departmentId: target.departmentId ?? "",
          teamId: target.teamId ?? "",
          isActive: target.isActive,
        }}
        departments={departments}
        teams={teams}
      />

      <ResetPasswordForm userId={target.id} userName={target.name} />

      {canDelete ? (
        <form
          action={deleteUserAccount}
          className="space-y-2 rounded border border-danger/40 bg-danger-soft/50 p-5"
        >
          <h2 className="text-sm font-semibold text-danger">Delete account</h2>
          <p className="text-xs text-danger">
            {target.name} never filed, owned, or commented on a ticket, so the account can be
            removed entirely. This cannot be undone.
          </p>
          <input type="hidden" name="id" value={target.id} />
          <button
            type="submit"
            className="rounded border border-danger/40 bg-surface px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger-soft"
          >
            Delete account
          </button>
        </form>
      ) : (
        <p className="rounded border border-line bg-surface px-4 py-3 text-xs text-muted">
          {isSelf
            ? "You cannot delete your own account."
            : "Accounts with ticket history cannot be deleted — disable them instead to keep the audit trail intact."}
        </p>
      )}
    </div>
  );
}
