import {
  canPerformAction,
  createTaskSchema,
  getAvailableActions,
  Role,
  TASK_TRANSITIONS,
  utf8ByteLength,
  type TaskStatus,
  type WorkflowActor,
} from '@workspace/shared';
import { describe, expect, it } from 'vitest';
import { parseMysqlUrl } from '../src/lib/database-url.js';
import { formatDateOnly, parseDateOnly, todayUtc } from '../src/lib/dates.js';

// Pure unit tests (no HTTP). The DB-backed setup file still runs, but nothing here touches it.

const assignee: WorkflowActor = { id: 'emp-1', role: Role.EMPLOYEE };
const otherEmployee: WorkflowActor = { id: 'emp-2', role: Role.EMPLOYEE };
const admin: WorkflowActor = { id: 'adm-1', role: Role.ADMIN };
const task = (status: TaskStatus) => ({ status, assignedToId: assignee.id });

describe('shared workflow table', () => {
  it('encodes exactly the five permitted transitions', () => {
    expect(TASK_TRANSITIONS).toEqual({
      start: {
        from: 'PENDING',
        to: 'IN_PROGRESS',
        actorRole: 'EMPLOYEE',
        requiresAssignee: true,
        requiresReason: false,
      },
      submit: {
        from: 'IN_PROGRESS',
        to: 'PENDING_APPROVAL',
        actorRole: 'EMPLOYEE',
        requiresAssignee: true,
        requiresReason: false,
      },
      approve: {
        from: 'PENDING_APPROVAL',
        to: 'COMPLETED',
        actorRole: 'ADMIN',
        requiresAssignee: false,
        requiresReason: false,
      },
      reject: {
        from: 'PENDING_APPROVAL',
        to: 'IN_PROGRESS',
        actorRole: 'ADMIN',
        requiresAssignee: false,
        requiresReason: true,
      },
    });
  });

  it('getAvailableActions per status and actor', () => {
    expect(getAvailableActions(task('PENDING'), assignee)).toEqual(['start']);
    expect(getAvailableActions(task('IN_PROGRESS'), assignee)).toEqual(['submit']);
    expect(getAvailableActions(task('PENDING_APPROVAL'), assignee)).toEqual([]);
    expect(getAvailableActions(task('PENDING_APPROVAL'), admin)).toEqual(['approve', 'reject']);
    expect(getAvailableActions(task('PENDING'), admin)).toEqual([]);
    expect(getAvailableActions(task('PENDING'), otherEmployee)).toEqual([]);
    for (const actor of [assignee, admin, otherEmployee]) {
      expect(getAvailableActions(task('COMPLETED'), actor)).toEqual([]);
    }
  });

  it('canPerformAction requires role, status and (for start/submit) assignment', () => {
    expect(canPerformAction('start', task('PENDING'), assignee)).toBe(true);
    expect(canPerformAction('start', task('PENDING'), otherEmployee)).toBe(false);
    expect(canPerformAction('start', task('PENDING'), admin)).toBe(false);
    expect(canPerformAction('approve', task('PENDING_APPROVAL'), assignee)).toBe(false);
    expect(canPerformAction('approve', task('IN_PROGRESS'), admin)).toBe(false);
    expect(canPerformAction('reject', task('PENDING_APPROVAL'), admin)).toBe(true);
  });
});

describe('parseMysqlUrl', () => {
  it('parses host, port, credentials and database, decoding percent-escapes', () => {
    expect(parseMysqlUrl('mysql://app%40x:p%3Ass%2Fw@db.example.com:3307/my_db')).toEqual({
      host: 'db.example.com',
      port: 3307,
      user: 'app@x',
      password: 'p:ss/w',
      database: 'my_db',
    });
  });

  it('defaults the port to 3306', () => {
    expect(parseMysqlUrl('mysql://u:p@localhost/app').port).toBe(3306);
  });

  it('rejects other schemes and a missing database name', () => {
    expect(() => parseMysqlUrl('postgres://u:p@localhost/app')).toThrow(/mysql:\/\//);
    expect(() => parseMysqlUrl('mysql://u:p@localhost/')).toThrow(/database name/);
    expect(() => parseMysqlUrl('not a url')).toThrow();
  });
});

describe('date-only helpers', () => {
  it('round-trips YYYY-MM-DD through UTC midnight', () => {
    for (const value of ['2030-01-01', '2028-02-29', '2030-12-31', '1999-07-04']) {
      const date = parseDateOnly(value);
      expect(date.toISOString()).toBe(`${value}T00:00:00.000Z`);
      expect(formatDateOnly(date)).toBe(value);
    }
  });

  it('rejects malformed and non-existent dates', () => {
    for (const value of [
      '2026-02-30',
      '2027-02-29',
      '2030-13-01',
      '2030-04-31',
      '10/10/2026',
      '2030-1-1',
      '',
    ]) {
      expect(() => parseDateOnly(value)).toThrow(/Invalid date-only value/);
    }
  });

  it('formats by UTC calendar date, not local time', () => {
    // 23:30 UTC is already the next day in UTC+1 and still the same day in UTC-5.
    expect(formatDateOnly(new Date('2030-06-15T23:30:00.000Z'))).toBe('2030-06-15');
    expect(formatDateOnly(new Date('2030-06-15T00:00:00.000-05:00'))).toBe('2030-06-15');
  });

  it('todayUtc returns midnight UTC of the current UTC date', () => {
    expect(todayUtc(new Date('2030-06-15T23:59:59.999Z')).toISOString()).toBe(
      '2030-06-15T00:00:00.000Z',
    );
  });

  it('the shared dueDate schema accepts real dates only', () => {
    const base = { title: 't', priority: 'LOW', assignedToId: 'cabcdefghijklmnop0000000' };
    expect(createTaskSchema.safeParse({ ...base, dueDate: '2028-02-29' }).success).toBe(true);
    expect(createTaskSchema.safeParse({ ...base, dueDate: '2027-02-29' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...base, dueDate: '2026-02-30' }).success).toBe(false);
  });
});

describe('utf8ByteLength', () => {
  it('matches Buffer.byteLength for ASCII, multibyte and astral characters', () => {
    for (const value of ['', 'abc', 'é', '€uro', '日本語', '😀x', 'a\u0301']) {
      expect(utf8ByteLength(value)).toBe(Buffer.byteLength(value, 'utf8'));
    }
  });
});
