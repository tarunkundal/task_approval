import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDueDate, isOverdue, todayLocalIso } from './dates';

// vitest.config.ts runs these tests with TZ=Pacific/Honolulu (UTC-10).

describe('timezone setup', () => {
  it('runs west of UTC', () => {
    expect(new Date(Date.UTC(2026, 0, 1)).getTimezoneOffset()).toBe(600);
  });
});

describe('formatDueDate', () => {
  it('does not shift the calendar date in a western timezone', () => {
    expect(formatDueDate('2026-01-01')).toBe('Jan 1, 2026');
  });

  it('handles month and year boundaries', () => {
    expect(formatDueDate('2025-12-31')).toBe('Dec 31, 2025');
    expect(formatDueDate('2026-03-01')).toBe('Mar 1, 2026');
    expect(formatDueDate('2028-02-29')).toBe('Feb 29, 2028');
  });

  it('returns unexpected input unchanged', () => {
    expect(formatDueDate('not-a-date')).toBe('not-a-date');
  });
});

describe('todayLocalIso', () => {
  it('uses the local calendar date, not UTC', () => {
    // 2026-01-02T05:00Z is still Jan 1 in Honolulu.
    expect(todayLocalIso(new Date('2026-01-02T05:00:00Z'))).toBe('2026-01-01');
    expect(todayLocalIso(new Date('2026-03-09T12:00:00Z'))).toBe('2026-03-09');
  });
});

describe('isOverdue', () => {
  const today = '2026-10-11';

  it('is overdue when due before today and not completed', () => {
    expect(isOverdue({ status: 'PENDING', dueDate: '2026-10-10' }, today)).toBe(true);
    expect(isOverdue({ status: 'IN_PROGRESS', dueDate: '2025-12-31' }, today)).toBe(true);
    expect(isOverdue({ status: 'PENDING_APPROVAL', dueDate: '2026-09-30' }, today)).toBe(true);
  });

  it('is not overdue when due today or later', () => {
    expect(isOverdue({ status: 'PENDING', dueDate: '2026-10-11' }, today)).toBe(false);
    expect(isOverdue({ status: 'PENDING', dueDate: '2026-10-12' }, today)).toBe(false);
  });

  it('is never overdue once completed', () => {
    expect(isOverdue({ status: 'COMPLETED', dueDate: '2020-01-01' }, today)).toBe(false);
  });
});

describe('formatDateTime', () => {
  it('formats an ISO timestamp in local time', () => {
    // 2026-01-02T05:00Z is 7:00 PM on Jan 1 in Honolulu.
    expect(formatDateTime('2026-01-02T05:00:00.000Z')).toMatch(/^Jan 1, 2026.*7:00\sPM$/);
  });

  it('returns invalid input unchanged', () => {
    expect(formatDateTime('nope')).toBe('nope');
  });
});
