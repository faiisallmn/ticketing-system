import { db } from "@/lib/db";
import { addBusinessMinutes, type CalendarInput, type HolidayInput } from "./business-time";
import { matchPolicy } from "./policy";

export type ResolvedPolicy = {
  policy: {
    id: string;
    name: string;
    firstResponseMinutes: number;
    resolutionMinutes: number;
  };
  calendar: CalendarInput;
  holidays: HolidayInput[];
};

/** Load active policies + holidays and pick the winner for this ticket shape. */
export async function resolveSlaPolicy(
  categoryId: string | null,
  priority: string,
): Promise<ResolvedPolicy | null> {
  const [policies, holidays] = await Promise.all([
    db.sLAPolicy.findMany({
      where: { isActive: true, businessHours: { isActive: true } },
      include: { businessHours: true },
      orderBy: { createdAt: "asc" },
    }),
    db.holiday.findMany({ orderBy: { date: "asc" } }),
  ]);

  const match = matchPolicy(policies, { categoryId, priority });
  if (!match) return null;

  return {
    policy: {
      id: match.id,
      name: match.name,
      firstResponseMinutes: match.firstResponseMinutes,
      resolutionMinutes: match.resolutionMinutes,
    },
    calendar: {
      timezone: match.businessHours.timezone,
      workdays: match.businessHours.workdays,
      workStart: match.businessHours.workStart,
      workEnd: match.businessHours.workEnd,
    },
    holidays: holidays.map((holiday) => ({ date: holiday.date, isRecurring: holiday.isRecurring })),
  };
}

/**
 * Business-time deadlines counted from `from`. Returns null when no policy
 * matches, in which case the ticket simply has no SLA (fields stay null).
 */
export async function computeDueDatesFor(
  categoryId: string | null,
  priority: string,
  from: Date,
): Promise<{ dueResponseAt: Date; dueResolutionAt: Date } | null> {
  const resolved = await resolveSlaPolicy(categoryId, priority);
  if (!resolved) return null;
  return {
    dueResponseAt: addBusinessMinutes(
      from,
      resolved.policy.firstResponseMinutes,
      resolved.calendar,
      resolved.holidays,
    ),
    dueResolutionAt: addBusinessMinutes(
      from,
      resolved.policy.resolutionMinutes,
      resolved.calendar,
      resolved.holidays,
    ),
  };
}
