import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { RoleBadge } from "@/components/tickets/badges";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">Your profile and sign-in details.</p>
      </div>

      <section className="rounded border border-line bg-surface p-5">
        <dl className="grid grid-cols-3 gap-2">
          <dt className="text-xs font-medium text-muted">Email</dt>
          <dd className="col-span-2 text-sm text-ink">{user.email}</dd>
          <dt className="text-xs font-medium text-muted">Role</dt>
          <dd className="col-span-2">
            <RoleBadge role={user.role} />
          </dd>
          <dt className="text-xs font-medium text-muted">Team</dt>
          <dd className="col-span-2 text-sm text-ink">
            {user.team?.name ?? user.department?.name ?? "—"}
          </dd>
        </dl>
        <p className="mt-3 text-xs text-faint">
          Email, role and team are managed by an administrator.
        </p>
      </section>

      <ProfileForm initial={{ name: user.name, jobTitle: user.jobTitle ?? "" }} />

      <PasswordForm />
    </div>
  );
}
