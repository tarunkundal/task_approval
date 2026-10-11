// Due dates are calendar dates (MySQL DATE). They are always converted at UTC midnight
// so a "YYYY-MM-DD" value never shifts with the server or browser timezone.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" -> Date at 00:00:00.000 UTC. Rejects malformed and non-existent dates. */
export function parseDateOnly(value: string): Date {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new Error(`Invalid date-only value: ${value}`);
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // Date.UTC rolls over (2026-02-30 -> 2026-03-02); a round trip catches that.
  if (formatDateOnly(date) !== value) throw new Error(`Invalid date-only value: ${value}`);
  return date;
}

/** Date -> "YYYY-MM-DD" using its UTC calendar date. */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in UTC, as a DATE-compatible value. */
export function todayUtc(now: Date = new Date()): Date {
  return parseDateOnly(formatDateOnly(now));
}
