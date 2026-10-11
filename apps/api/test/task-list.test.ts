import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, loginCookie, type TestUser } from './helpers/auth.js';
import { createTaskRow, createTestApp } from './helpers/tasks.js';

const TASKS = '/api/v1/tasks';

let app: Express;
let admin: TestUser;
let employee1: TestUser;
let employee2: TestUser;
let adminCookie: string;
let employee1Cookie: string;

interface ListedTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
  assignedTo: { id: string };
}

// 7 live tasks + 1 deleted. Created in this order, so default sort (createdAt desc) is reversed.
const FIXTURES = [
  { title: 'Alpha report', who: 'e1', status: 'PENDING', priority: 'LOW', dueDate: '2030-01-05' },
  {
    title: 'Beta REPORT',
    who: 'e1',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    dueDate: '2030-01-01',
  },
  {
    title: 'Gamma review',
    who: 'e1',
    status: 'PENDING_APPROVAL',
    priority: 'MEDIUM',
    dueDate: '2030-01-03',
  },
  { title: 'Delta', who: 'e2', status: 'PENDING', priority: 'HIGH', dueDate: '2030-01-07' },
  {
    title: 'Epsilon report',
    who: 'e2',
    status: 'COMPLETED',
    priority: 'LOW',
    dueDate: '2030-01-02',
  },
  { title: 'Zeta', who: 'e2', status: 'PENDING', priority: 'MEDIUM', dueDate: '2030-01-06' },
  {
    title: 'Eta 100%_match',
    who: 'e1',
    status: 'PENDING',
    priority: 'MEDIUM',
    dueDate: '2030-01-04',
  },
] as const;

beforeAll(async () => {
  app = createTestApp();
  const password = 'Password@12345';
  admin = await createTestUser({
    name: 'Ada Admin',
    email: 'admin@l.local',
    role: 'ADMIN',
    password,
  });
  employee1 = await createTestUser({
    name: 'Eli One',
    email: 'e1@l.local',
    role: 'EMPLOYEE',
    password,
  });
  employee2 = await createTestUser({
    name: 'Eve Two',
    email: 'e2@l.local',
    role: 'EMPLOYEE',
    password,
  });
  adminCookie = await loginCookie(app, admin);
  employee1Cookie = await loginCookie(app, employee1);

  for (const fixture of FIXTURES) {
    await createTaskRow({
      title: fixture.title,
      status: fixture.status,
      priority: fixture.priority,
      dueDate: fixture.dueDate,
      assignedToId: fixture.who === 'e1' ? employee1.id : employee2.id,
      createdById: admin.id,
    });
    // Distinct createdAt values (DATETIME(3)) so the default order is deterministic.
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await createTaskRow({
    title: 'Deleted report',
    assignedToId: employee1.id,
    createdById: admin.id,
    deletedAt: new Date(),
  });
});

async function list(cookie: string, query: Record<string, string | number> = {}) {
  const res = await request(app).get(TASKS).query(query).set('Cookie', cookie);
  return {
    status: res.status,
    body: res.body as { data: ListedTask[]; meta: Record<string, number> },
  };
}

const titles = (res: { body: { data: ListedTask[] } }) => res.body.data.map((task) => task.title);

describe('GET /api/v1/tasks (admin)', () => {
  it('lists all non-deleted tasks, newest first, with pagination meta', async () => {
    const res = await list(adminCookie);

    expect(res.status).toBe(200);
    expect(titles(res)).toEqual([...FIXTURES].reverse().map((f) => f.title));
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 7, totalPages: 1 });
  });

  it('paginates with stable pages and correct totals', async () => {
    const page1 = await list(adminCookie, { pageSize: 3, page: 1, sort: 'dueDate', order: 'asc' });
    const page3 = await list(adminCookie, { pageSize: 3, page: 3, sort: 'dueDate', order: 'asc' });
    const beyond = await list(adminCookie, { pageSize: 3, page: 4 });

    expect(page1.body.data.map((t) => t.dueDate)).toEqual([
      '2030-01-01',
      '2030-01-02',
      '2030-01-03',
    ]);
    expect(page1.body.meta).toEqual({ page: 1, pageSize: 3, total: 7, totalPages: 3 });
    expect(page3.body.data.map((t) => t.dueDate)).toEqual(['2030-01-07']);
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta.total).toBe(7);
  });

  it('filters by status', async () => {
    const res = await list(adminCookie, { status: 'PENDING' });

    expect(res.body.data.every((t) => t.status === 'PENDING')).toBe(true);
    expect(res.body.meta.total).toBe(4);
  });

  it('filters by priority', async () => {
    const res = await list(adminCookie, { priority: 'HIGH' });

    expect(titles(res).sort()).toEqual(['Beta REPORT', 'Delta']);
  });

  it('filters by employee', async () => {
    const res = await list(adminCookie, { assignedToId: employee2.id });

    expect(titles(res).sort()).toEqual(['Delta', 'Epsilon report', 'Zeta']);
    expect(res.body.data.every((t) => t.assignedTo.id === employee2.id)).toBe(true);
  });

  it('searches titles case-insensitively and excludes deleted tasks', async () => {
    const res = await list(adminCookie, { q: '  report ' });

    expect(titles(res).sort()).toEqual(['Alpha report', 'Beta REPORT', 'Epsilon report']);
  });

  it('treats % and _ in the search as literal characters', async () => {
    expect(titles(await list(adminCookie, { q: '100%_' }))).toEqual(['Eta 100%_match']);
    expect(titles(await list(adminCookie, { q: '%' }))).toEqual(['Eta 100%_match']);
    expect(titles(await list(adminCookie, { q: '_' }))).toEqual(['Eta 100%_match']);
    // A lone backslash is literal too (no title contains one).
    expect(titles(await list(adminCookie, { q: '\\' }))).toEqual([]);
  });

  it('combines filters', async () => {
    const res = await list(adminCookie, {
      assignedToId: employee1.id,
      status: 'PENDING',
      priority: 'MEDIUM',
    });

    expect(titles(res)).toEqual(['Eta 100%_match']);
  });

  it('sorts by priority (HIGH first when desc) and by title-independent fields', async () => {
    const res = await list(adminCookie, { sort: 'priority', order: 'desc' });
    const priorities = res.body.data.map((t) => t.priority);

    expect(priorities).toEqual(['HIGH', 'HIGH', 'MEDIUM', 'MEDIUM', 'MEDIUM', 'LOW', 'LOW']);
  });

  it.each([
    ['pageSize over 100', { pageSize: 101 }],
    ['pageSize 0', { pageSize: 0 }],
    ['page 0', { page: 0 }],
    ['non-numeric page', { page: 'two' }],
    ['unknown status', { status: 'DONE' }],
    ['unknown priority', { priority: 'URGENT' }],
    ['malformed assignedToId', { assignedToId: 'nope' }],
    ['unknown sort', { sort: 'title' }],
    ['unknown order', { order: 'up' }],
    ['q over 100 characters', { q: 'x'.repeat(101) }],
    ['unknown parameter', { deleted: 'true' }],
  ])('%s → 400 VALIDATION_ERROR', async (_name, query) => {
    const res = await list(adminCookie, query);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('accepts pageSize 100', async () => {
    expect((await list(adminCookie, { pageSize: 100 })).status).toBe(200);
  });
});

describe('GET /api/v1/tasks (employee)', () => {
  it('returns only the caller’s own tasks, with totals for their scope', async () => {
    const res = await list(employee1Cookie);

    expect(res.status).toBe(200);
    expect(titles(res).sort()).toEqual(
      ['Alpha report', 'Beta REPORT', 'Eta 100%_match', 'Gamma review'].sort(),
    );
    expect(res.body.meta.total).toBe(4);
    expect(res.body.data.every((t) => t.assignedTo.id === employee1.id)).toBe(true);
  });

  it('filters by status and priority within their own tasks', async () => {
    expect(titles(await list(employee1Cookie, { status: 'PENDING' })).sort()).toEqual([
      'Alpha report',
      'Eta 100%_match',
    ]);
    expect(titles(await list(employee1Cookie, { priority: 'HIGH' }))).toEqual(['Beta REPORT']);
    // Another employee's HIGH task (Delta) never shows up.
    expect(titles(await list(employee1Cookie, { q: 'Delta' }))).toEqual([]);
  });
});
