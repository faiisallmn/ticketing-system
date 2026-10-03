/**
 * Business-time arithmetic for SLA deadlines.
 *
 * All calculations are done against a calendar defined in its own IANA
 * timezone (e.g. Asia/Jakarta). Public functions are pure and take the
 * calendar + holidays as arguments so they are trivially unit-testable and
 * usable from both Server Actions and the BullMQ worker.
 */

export type CalendarInput = {
  timezone: string;
  /** 0 = Sunday … 6 = Saturday. */
  workdays: number[];
  /** "HH:MM" 24-hour wall times in the calendar's timezone. */
  workStart: string;
  workEnd: string;
};

export type HolidayInput = {
  date: Date;
  isRecurring: boolean;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatterCache.set(timezone, created);
  return created;
}

function toZonedParts(date: Date, timezone: string): ZonedParts {
  const parts = formatter(timezone).formatToParts(date);
  const get = (type: string): number => {
    const part = parts.find((entry) => entry.type === type);
    if (!part) throw new Error(`Cannot resolve ${type} for timezone ${timezone}`);
    return Number(part.value);
  };
  const year = get("year");
  const month = get("month");
  const day = get("day");
  // "24" is midnight at the end of the day in some locales — normalize.
  const hour = get("hour") % 24;
  const minute = get("minute");
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, weekday, minutes: hour * 60 + minute };
}

/** Minutes offset of `timezone` east of UTC at `date` (handles DST). */
function tzOffsetMinutes(date: Date, timezone: string): number {
  const parts = formatter(timezone).formatToParts(date);
  const get = (type: string): number => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return (asUtc - date.getTime()) / 60000;
}

/** Resolve a wall time in `timezone` to a UTC instant (DST-safe). */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const refined = new Date(naive.getTime() - tzOffsetMinutes(naive, timezone) * 60000);
  return new Date(naive.getTime() - tzOffsetMinutes(refined, timezone) * 60000);
}

export function parseHm(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid HH:MM value: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid HH:MM value: ${value}`);
  return hours * 60 + minutes;
}

function ymd(parts: Pick<ZonedParts, "year" | "month" | "day">): string {
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

function isHoliday(parts: ZonedParts, holidays: HolidayInput[]): boolean {
  const full = ymd(parts);
  const recurring = full.slice(5);
  return holidays.some((holiday) => {
    const hd = new Date(holiday.date);
    const month = String(hd.getUTCMonth() + 1).padStart(2, "0");
    const day = String(hd.getUTCDate()).padStart(2, "0");
    if (holiday.isRecurring) return `${month}-${day}` === recurring;
    return `${hd.getUTCFullYear()}-${month}-${day}` === full;
  });
}

function isWorkInstant(parts: ZonedParts, cal: CalendarInput, holidays: HolidayInput[]): boolean {
  if (!cal.workdays.includes(parts.weekday)) return false;
  if (isHoliday(parts, holidays)) return false;
  const start = parseHm(cal.workStart);
  const end = parseHm(cal.workEnd);
  return parts.minutes >= start && parts.minutes < end;
}

/** Start of the workday `daysAhead` days after the day containing `date`. */
function workdayStart(date: Date, daysAhead: number, cal: CalendarInput): Date {
  const parts = toZonedParts(date, cal.timezone);
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  base.setUTCDate(base.getUTCDate() + daysAhead);
  const [hour, minute] = cal.workStart.split(":").map(Number) as [number, number];
  return zonedTimeToUtc(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate(),
    hour,
    minute,
    cal.timezone,
  );
}

/** Start of the next workday on/after the day after `date`'s day. */
function nextWorkStart(date: Date, cal: CalendarInput, holidays: HolidayInput[]): Date {
  let cursor = workdayStart(date, 1, cal);
  for (let guard = 0; guard < 366 * 2; guard += 1) {
    if (isWorkInstant(toZonedParts(cursor, cal.timezone), cal, holidays)) return cursor;
    cursor = workdayStart(cursor, 1, cal);
  }
  throw new Error("Calendar has no workable time within two years — check workdays and holidays.");
}

/**
 * If `date` falls inside working time, return it unchanged; otherwise return
 * the next working instant (start of the next workday).
 */
export function alignToWorkTime(date: Date, cal: CalendarInput, holidays: HolidayInput[]): Date {
  const parts = toZonedParts(date, cal.timezone);
  if (isWorkInstant(parts, cal, holidays)) return new Date(date.getTime());
  return nextWorkStart(date, cal, holidays);
}

/**
 * Add business minutes to `from`, skipping nights, weekends and holidays.
 * A `from` outside working time starts counting at the next work start.
 */
export function addBusinessMinutes(
  from: Date,
  minutes: number,
  cal: CalendarInput,
  holidays: HolidayInput[],
): Date {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error("minutes must be a non-negative number");
  }
  if (minutes === 0) return alignToWorkTime(from, cal, holidays);

  let cursor = alignToWorkTime(from, cal, holidays);
  let remaining = minutes;
  const workEnd = parseHm(cal.workEnd);

  for (let guard = 0; guard < 366 * 3; guard += 1) {
    const parts = toZonedParts(cursor, cal.timezone);
    const available = workEnd - parts.minutes;
    if (available <= 0) {
      cursor = nextWorkStart(cursor, cal, holidays);
      continue;
    }
    if (remaining <= available) {
      return new Date(cursor.getTime() + remaining * 60000);
    }
    remaining -= available;
    cursor = nextWorkStart(cursor, cal, holidays);
  }
  throw new Error("Calendar has no workable time within three years — check workdays and holidays.");
}
