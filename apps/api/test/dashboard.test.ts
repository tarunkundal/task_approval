import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { formatDateOnly } from '../src/lib/dates.js';
import { createTestUser, loginCookie, type TestUser } from './helpers/auth.js';
import { createTaskRow, createTestApp } from './helpers/tasks.js';

const SUMMARY = '/api/v1/dashboard/summary';

let app: Express;
let admin: TestUser;
let employee1: TestUser;
let employee2: TestUser;
let adminCookie: string;
let employee1Cookie: string;
let employee2Cookie: string;
let employee3Cookie: string;

const daysFromToday = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
};

beforeAll(async () => {
  app = createTestApp();
  const password = 'Password@12345';
  admin = await createTestUser({
    name: 'Ada Admin',
    email: 'admin@d.local',
    role: 'ADMIN',
    password,
  });
  employee1 = await createTestUser({
    name: 'Eli One',
    email: 'e1@d.local',
    role: 'EMPLOYEE',
    password,
  });
  employee2 = await createTestUser({
    name: 'Eve Two',
    email: 'e2@d.local',
    role: 'EMPLOYEE',
    password,
  });
  const employee3 = await createTestUser({
    name: 'Ivy Three',
    email: 'e3@d.local',
    role: 'EMPLOYEE',
    password,
  });
  adminCookie = await loginCookie(app, admin);
  employee1Cookie = await loginCookie(app, employee1);
  employee2Cookie = await loginCookie(app, employee2);
  employee3Cookie = await loginCookie(app, employee3);

  const add = (
    who: TestUser,
    status: 'PENDING' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'COMPLETED',
    dueInDays: number,
    deleted = false,
  ) =>
    createTaskRow({
      assignedToId: who.id,
      createdById: admin.id,
      status,
      dueDate: daysFromToday(dueInDays),
      deletedAt: deleted ? new Date() : null,
    });

  // employee1: 25 tasks (more than one default page) — 22 PENDING, 2 IN_PROGRESS, 1 COMPLETED.
  for (let i = 0; i < 22; i += 1) await add(employee1, 'PENDING', 10);
  await add(employee1, 'IN_PROGRESS', -2); // overdue
  await add(employee1, 'IN_PROGRESS', 0); // due today: not overdue
  await add(employee1, 'COMPLETED', -5); // past due but completed: not overdue
  // employee2: 1 PENDING_APPROVAL (overdue), 1 PENDING.
  await add(employee2, 'PENDING_APPROVAL', -1);
  await add(employee2, 'PENDING', 3);
  // Soft-deleted tasks are never counted, even when overdue.
  await add(employee1, 'PENDING', -3, true);
  await add(employee2, 'COMPLETED', 1, true);
});

describe('GET /api/v1/dashboard/summary', () => {
  it('admin: counts every non-deleted task, independent of pagination', async () => {
    const res = await request(app).get(SUMMARY).set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 27,
      byStatus: { PENDING: 23, IN_PROGRESS: 2, PENDING_APPROVAL: 1, COMPLETED: 1 },
      overdue: 2,
    });
    // The list's first page holds only 20 of them; the totals still agree.
    const list = await request(app).get('/api/v1/tasks').set('Cookie', adminCookie);
    expect(list.body.data).toHaveLength(20);
    expect(list.body.meta.total).toBe(res.body.total);
  });

  it('employee: counts only their own tasks', async () => {
    const one = await request(app).get(SUMMARY).set('Cookie', employee1Cookie);
    const two = await request(app).get(SUMMARY).set('Cookie', employee2Cookie);

    expect(one.body).toEqual({
      total: 25,
      byStatus: { PENDING: 22, IN_PROGRESS: 2, PENDING_APPROVAL: 0, COMPLETED: 1 },
      overdue: 1,
    });
    expect(two.body).toEqual({
      total: 2,
      byStatus: { PENDING: 1, IN_PROGRESS: 0, PENDING_APPROVAL: 1, COMPLETED: 0 },
      overdue: 1,
    });
  });

  it('an employee with no tasks gets all four status keys at 0', async () => {
    const res = await request(app).get(SUMMARY).set('Cookie', employee3Cookie);

    expect(res.body).toEqual({
      total: 0,
      byStatus: { PENDING: 0, IN_PROGRESS: 0, PENDING_APPROVAL: 0, COMPLETED: 0 },
      overdue: 0,
    });
  });

  it('requires authentication', async () => {
    expect((await request(app).get(SUMMARY)).status).toBe(401);
  });
});
