import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { NewTicketForm } from "./new-ticket-form";

export const metadata: Metadata = {
  title: "New ticket",
};

export default async function NewTicketPage() {
  const user = await requireUser();
  if (!can(user.role, "ticket:create")) forbidden();

  const isStaff = user.role !== "REQUESTER";

  const [categories, tags, departments, teams, staff, requesters] = await Promise.all([
    db.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.team.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, departmentId: true },
    }),
    isStaff
      ? db.user.findMany({
          where: { role: { in: ["ADMIN", "MANAGER", "AGENT"] }, isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    isStaff
      ? db.user.findMany({
          where: { role: "REQUESTER", isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold leading-[28px]">New ticket</h1>
        <p className="mt-1 text-sm text-muted">
          {isStaff
            ? "File a ticket for yourself or on behalf of a requester."
            : "Describe your issue and the support team will pick it up."}
        </p>
      </div>

      <NewTicketForm
        isStaff={isStaff}
        categories={categories}
        tags={tags}
        departments={departments}
        teams={teams}
        staff={staff}
        requesters={requesters}
      />
    </div>
  );
}
