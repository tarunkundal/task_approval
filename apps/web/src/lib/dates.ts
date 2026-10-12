import { TaskStatus } from '@workspace/shared';

/**
 * `dueDate` is a calendar date (`YYYY-MM-DD`), not an instant. It is never passed to
 * `new Date(string)` (which parses it as UTC midnight and shifts it a day in western timezones);
 * it is formatted as a UTC date and compared as a string.
 */

const DUE_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-01-01` → `Jan 1, 2026`, independent of the viewer's timezone. */
export function formatDueDate(value: string): string {
  const match = DATE_ONLY.exec(value);
  if (!match) return value;
  const [, y, m, d] = match;
  return DUE_DATE_FORMAT.format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))));
}

/** Today's date in the viewer's local timezone, as `YYYY-MM-DD`. */
export function todayLocalIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Past due (strictly before today, local date) and not COMPLETED. Due today is not overdue. */
export function isOverdue(
  task: { status: TaskStatus; dueDate: string },
  today: string = todayLocalIso(),
): boolean {
  return task.status !== TaskStatus.COMPLETED && task.dueDate < today;
}

/** ISO 8601 timestamp → local medium date + short time. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME_FORMAT.format(date);
}
