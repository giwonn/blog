import { fromZonedTime } from "date-fns-tz";

/**
 * Converts a date-only range `[fromDate, toDate]` in the given IANA timezone
 * to a UTC datetime range with an exclusive upper bound.
 *
 * Example: `toUtcDateRange("2026-04-13", "2026-04-13", "Asia/Seoul")` returns
 *   { fromUtc: 2026-04-12T15:00:00Z, toUtcExclusive: 2026-04-13T15:00:00Z }
 *
 * Mirrors the Kotlin AnalyticsController.toUtcRange helper.
 *
 * @param fromDate YYYY-MM-DD (inclusive, midnight local)
 * @param toDate   YYYY-MM-DD (inclusive, whole day in local tz)
 * @param tz       IANA timezone name, e.g. "Asia/Seoul", "UTC"
 */
export function toUtcDateRange(
  fromDate: string,
  toDate: string,
  tz: string,
): { fromUtc: Date; toUtcExclusive: Date } {
  const fromUtc = fromZonedTime(`${fromDate}T00:00:00`, tz);
  // Exclusive upper bound = start of (toDate + 1) in tz.
  const toNext = nextDayString(toDate);
  const toUtcExclusive = fromZonedTime(`${toNext}T00:00:00`, tz);
  return { fromUtc, toUtcExclusive };
}

function nextDayString(yyyyMmDd: string): string {
  // Parse as UTC date-only and add 1 day. Safe because we never cross DST here —
  // we're just computing "the calendar date after this one".
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
