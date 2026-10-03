import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { db } from "@/lib/db";
import { PRIORITY_LABELS } from "@/lib/labels";
import { formatDuration } from "@/lib/sla/state";
import {
  deleteBusinessHours,
  deleteHoliday,
  deleteSlaPolicy,
  setDefaultBusinessHours,
  toggleBusinessHours,
  toggleSlaPolicy,
} from "./actions";
import { BusinessHoursForm } from "./business-hours-form";
import { HolidayForm } from "./holiday-form";
import { SlaPolicyForm } from "./sla-policy-form";

export const metadata: Metadata = {
  title: "SLA policies",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function SlaAdminPage() {
  await requirePermission("sla:manage");

  const [calendars, holidays, policies, categories] = await Promise.all([
    db.businessHours.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { policies: true } } },
    }),
    db.holiday.findMany({ orderBy: { date: "asc" } }),
    db.sLAPolicy.findMany({
      orderBy: { name: "asc" },
      include: {
        category: { select: { name: true } },
        businessHours: { select: { name: true } },
      },
    }),
    db.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">SLA policies</h1>
        <p className="mt-1 text-sm text-muted">
          Deadlines are counted in business time from these calendars.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Working calendars</h2>
          {calendars.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No calendars yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded border border-line">
              {calendars.map((calendar) => (
                <li key={calendar.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {calendar.name}
                      {calendar.isDefault ? (
                        <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                          Default
                        </span>
                      ) : null}
                      {!calendar.isActive ? (
                        <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted">
                          Disabled
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {calendar.timezone} ·{" "}
                      {calendar.workdays.map((day) => WEEKDAYS[day]).join(", ")} ·{" "}
                      {calendar.workStart}–{calendar.workEnd} · {calendar._count.policies}{" "}
                      {calendar._count.policies === 1 ? "policy" : "policies"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {!calendar.isDefault ? (
                      <form action={setDefaultBusinessHours}>
                        <input type="hidden" name="id" value={calendar.id} />
                        <button
                          type="submit"
                          className="rounded border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sunken"
                        >
                          Default
                        </button>
                      </form>
                    ) : null}
                    <form action={toggleBusinessHours}>
                      <input type="hidden" name="id" value={calendar.id} />
                      <input type="hidden" name="active" value={calendar.isActive ? "false" : "true"} />
                      <button
                        type="submit"
                        className="rounded border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sunken"
                      >
                        {calendar.isActive ? "Disable" : "Enable"}
                      </button>
                    </form>
                    {calendar._count.policies === 0 ? (
                      <form action={deleteBusinessHours}>
                        <input type="hidden" name="id" value={calendar.id} />
                        <button
                          type="submit"
                          className="rounded border border-line px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger-soft"
                        >
                          Delete
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <BusinessHoursForm />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Holidays</h2>
          {holidays.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No holidays — every workday counts.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded border border-line">
              {holidays.map((holiday) => (
                <li key={holiday.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{holiday.name}</p>
                    <p className="text-xs text-muted">
                      {holiday.date.toISOString().slice(0, 10)}
                      {holiday.isRecurring ? " · repeats yearly" : ""}
                    </p>
                  </div>
                  <form action={deleteHoliday} className="shrink-0">
                    <input type="hidden" name="id" value={holiday.id} />
                    <button
                      type="submit"
                      className="rounded border border-line px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger-soft"
                    >
                      Delete
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>

        <HolidayForm />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Policies</h2>
          <p className="mt-1 text-xs text-muted">
            Most specific match wins: category + priority, then category, then priority, then the
            default policy.
          </p>
          {policies.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No policies — tickets will have no deadlines until you add one.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded border border-line">
              {policies.map((policy) => (
                <li key={policy.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {policy.name}
                      {policy.isDefault ? (
                        <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                          Default
                        </span>
                      ) : null}
                      {!policy.isActive ? (
                        <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted">
                          Disabled
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {policy.category?.name ?? "Any category"} ·{" "}
                      {policy.priority ? PRIORITY_LABELS[policy.priority] : "Any priority"} ·
                      respond {formatDuration(policy.firstResponseMinutes * 60000)} · resolve{" "}
                      {formatDuration(policy.resolutionMinutes * 60000)} ·{" "}
                      {policy.businessHours.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <form action={toggleSlaPolicy}>
                      <input type="hidden" name="id" value={policy.id} />
                      <input type="hidden" name="active" value={policy.isActive ? "false" : "true"} />
                      <button
                        type="submit"
                        className="rounded border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-sunken"
                      >
                        {policy.isActive ? "Disable" : "Enable"}
                      </button>
                    </form>
                    <form action={deleteSlaPolicy}>
                      <input type="hidden" name="id" value={policy.id} />
                      <button
                        type="submit"
                        className="rounded border border-line px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger-soft"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <SlaPolicyForm categories={categories} calendars={calendars} />
      </section>
    </div>
  );
}
