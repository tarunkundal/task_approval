import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { transitionTask } from '../src/services/task-workflow.service.js';
import { createTestUser, loginCookie, type TestUser } from './helpers/auth.js';
import { createTaskRow, createTestApp, historyRows, taskStatus } from './helpers/tasks.js';

const TASKS = '/api/v1/tasks';

let app: Express;
let admin: TestUser;
let employee1: TestUser;
let employee2: TestUser;
let adminCookie: string;
let employee1Cookie: string;
let employee2Cookie: string;

beforeAll(async () => {
  app = createTestApp();
  const password = 'Password@12345';
  admin = await createTestUser({
    name: 'Ada Admin',
    email: 'admin@w.local',
    role: 'ADMIN',
    password,
  });
  employee1 = await createTestUser({
    name: 'Eli One',
    email: 'e1@w.local',
    role: 'EMPLOYEE',
    password,
  });
  employee2 = await createTestUser({
    name: 'Eve Two',
    email: 'e2@w.local',
    role: 'EMPLOYEE',
    password,
  });
  adminCookie = await loginCookie(app, admin);
  employee1Cookie = await loginCookie(app, employee1);
  employee2Cookie = await loginCookie(app, employee2);
});

type Status = 'PENDING' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'COMPLETED';

const taskFor = (assignee: TestUser, status: Status = 'PENDING') =>
  createTaskRow({ assignedToId: assignee.id, createdById: admin.id, status });

const act = (cookie: string, id: string, action: string, body?: object) => {
  const req = request(app).post(`${TASKS}/${id}/${action}`).set('Cookie', cookie);
  return body === undefined ? req : req.send(body);
};

describe('[spec #2] an employee cannot approve', () => {
  it('approve as the assignee → 403; status stays PENDING_APPROVAL; no history row', async () => {
    const id = await taskFor(employee1, 'PENDING_APPROVAL');

    const res = await act(employee1Cookie, id, 'approve');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(await taskStatus(id)).toBe('PENDING_APPROVAL');
    expect(await historyRows(id)).toHaveLength(1);
    const row = await prisma.task.findUnique({ where: { id } });
    expect(row?.reviewedById).toBeNull();
    expect(row?.reviewedAt).toBeNull();
  });

  it('reject as an employee → 403 and status unchanged', async () => {
    const id = await taskFor(employee1, 'PENDING_APPROVAL');

    const res = await act(employee1Cookie, id, 'reject', { reason: 'nope' });

    expect(res.status).toBe(403);
    expect(await taskStatus(id)).toBe('PENDING_APPROVAL');
  });

  it('the service refuses approve/reject for a non-admin actor too (defence in depth)', async () => {
    const id = await taskFor(employee1, 'PENDING_APPROVAL');

    await expect(
      transitionTask({ id: employee1.id, role: 'EMPLOYEE' }, id, 'approve'),
    ).rejects.toMatchObject({ status: 403 });
    expect(await taskStatus(id)).toBe('PENDING_APPROVAL');
  });

  it('start/submit as an admin → 403', async () => {
    const pending = await taskFor(employee1, 'PENDING');
    const inProgress = await taskFor(employee1, 'IN_PROGRESS');

    expect((await act(adminCookie, pending, 'start')).status).toBe(403);
    expect((await act(adminCookie, inProgress, 'submit')).status).toBe(403);
    expect(await taskStatus(pending)).toBe('PENDING');
    expect(await taskStatus(inProgress)).toBe('IN_PROGRESS');
  });
});

describe('[spec #3] admin approves a PENDING_APPROVAL task', () => {
  it('200 COMPLETED; reviewer and review time set; history row persisted', async () => {
    const id = await taskFor(employee1, 'PENDING_APPROVAL');
    const before = Date.now();

    const res = await act(adminCookie, id, 'approve');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.reviewedBy).toEqual({ id: admin.id, name: admin.name });
    expect(Date.parse(res.body.reviewedAt)).toBeGreaterThanOrEqual(before - 1000);

    const row = await prisma.task.findUnique({ where: { id } });
    expect(row?.status).toBe('COMPLETED');
    expect(row?.reviewedById).toBe(admin.id);
    expect(row?.reviewedAt).toBeInstanceOf(Date);
    expect((await historyRows(id)).at(-1)).toEqual({
      fromStatus: 'PENDING_APPROVAL',
      toStatus: 'COMPLETED',
      actorId: admin.id,
      reason: null,
    });
  });
});

describe('[spec #4] admin rejects a PENDING_APPROVAL task', () => {
  it('→ IN_PROGRESS; reason stored in history and shown as latestRejectionReason', async () => {
    const id = await taskFor(employee1, 'PENDING_APPROVAL');

    const res = await act(adminCookie, id, 'reject', { reason: '  Add the missing totals.  ' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(res.body.latestRejectionReason).toBe('Add the missing totals.');
    expect(res.body.reviewedBy).toEqual({ id: admin.id, name: admin.name });
    expect((await historyRows(id)).at(-1)).toEqual({
      fromStatus: 'PENDING_APPROVAL',
      toStatus: 'IN_PROGRESS',
      actorId: admin.id,
      reason: 'Add the missing totals.',
    });
    // No feedback comment is created; the reason lives in the history row.
    expect(await prisma.taskComment.count({ where: { taskId: id } })).toBe(0);

    // The employee sees the feedback on their task.
    const asEmployee = await request(app).get(`${TASKS}/${id}`).set('Cookie', employee1Cookie);
    expect(asEmployee.body.latestRejectionReason).toBe('Add the missing totals.');
  });

  it.each([
    ['no body', undefined],
    ['an empty object', {}],
    ['an empty reason', { reason: '' }],
    ['a whitespace reason', { reason: '   ' }],
    ['a reason over 1000 characters', { reason: 'x'.repeat(1001) }],
    ['an unknown key', { reason: 'ok', extra: true }],
  ])('reject with %s → 400 and status unchanged', async (_name, body) => {
    const id = await taskFor(employee1, 'PENDING_APPROVAL');

    const res = await act(adminCookie, id, 'reject', body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await taskStatus(id)).toBe('PENDING_APPROVAL');
    expect(await historyRows(id)).toHaveLength(1);
  });
});

describe("[spec #5] employee 1 cannot act on employee 2's task", () => {
  it('start and submit → 404; status unchanged', async () => {
    const pending = await taskFor(employee2, 'PENDING');
    const inProgress = await taskFor(employee2, 'IN_PROGRESS');

    const start = await act(employee1Cookie, pending, 'start');
    const submit = await act(employee1Cookie, inProgress, 'submit');

    expect(start.status).toBe(404);
    expect(start.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
    expect(submit.status).toBe(404);
    expect(await taskStatus(pending)).toBe('PENDING');
    expect(await taskStatus(inProgress)).toBe('IN_PROGRESS');
  });
});

describe('[spec #6] invalid status transitions → 409', () => {
  it.each<[string, Status, 'employee' | 'admin', string]>([
    ['start on IN_PROGRESS', 'IN_PROGRESS', 'employee', 'start'],
    ['start on COMPLETED', 'COMPLETED', 'employee', 'start'],
    ['submit on PENDING', 'PENDING', 'employee', 'submit'],
    ['submit on PENDING_APPROVAL', 'PENDING_APPROVAL', 'employee', 'submit'],
    ['approve on PENDING', 'PENDING', 'admin', 'approve'],
    ['approve on IN_PROGRESS', 'IN_PROGRESS', 'admin', 'approve'],
    ['approve on COMPLETED', 'COMPLETED', 'admin', 'approve'],
    ['reject on IN_PROGRESS', 'IN_PROGRESS', 'admin', 'reject'],
    ['reject on COMPLETED', 'COMPLETED', 'admin', 'reject'],
  ])('%s → 409 INVALID_TRANSITION, status unchanged', async (_name, status, who, action) => {
    const id = await taskFor(employee1, status);
    const cookie = who === 'admin' ? adminCookie : employee1Cookie;

    const res = await act(cookie, id, action, action === 'reject' ? { reason: 'r' } : undefined);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.message).toContain(status);
    expect(res.body.error.details).toEqual({ action, currentStatus: status });
    expect(await taskStatus(id)).toBe(status);
    expect(await historyRows(id)).toHaveLength(1);
  });
});

describe('[spec #8] valid employee workflow', () => {
  it('PENDING → IN_PROGRESS → PENDING_APPROVAL, with history rows in order', async () => {
    const id = await taskFor(employee1, 'PENDING');

    const started = await act(employee1Cookie, id, 'start');
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('IN_PROGRESS');

    const submitted = await act(employee1Cookie, id, 'submit');
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe('PENDING_APPROVAL');
    expect(submitted.body.reviewedBy).toBeNull();

    expect(await historyRows(id)).toEqual([
      { fromStatus: null, toStatus: 'PENDING', actorId: admin.id, reason: null },
      { fromStatus: 'PENDING', toStatus: 'IN_PROGRESS', actorId: employee1.id, reason: null },
      {
        fromStatus: 'IN_PROGRESS',
        toStatus: 'PENDING_APPROVAL',
        actorId: employee1.id,
        reason: null,
      },
    ]);
  });

  it('full cycle: create → start → submit → reject → resubmit → approve', async () => {
    const created = await request(app).post(TASKS).set('Cookie', adminCookie).send({
      title: 'Full cycle',
      priority: 'MEDIUM',
      dueDate: '2030-03-03',
      assignedToId: employee1.id,
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    expect((await act(employee1Cookie, id, 'start')).status).toBe(200);
    expect((await act(employee1Cookie, id, 'submit')).status).toBe(200);
    const rejected = await act(adminCookie, id, 'reject', { reason: 'Needs a chart' });
    expect(rejected.body.latestRejectionReason).toBe('Needs a chart');

    // Resume after rejection: still IN_PROGRESS, submit again.
    const resubmitted = await act(employee1Cookie, id, 'submit');
    expect(resubmitted.status).toBe(200);
    expect(resubmitted.body.status).toBe('PENDING_APPROVAL');
    expect(resubmitted.body.latestRejectionReason).toBeNull();

    const approved = await act(adminCookie, id, 'approve');
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('COMPLETED');
    expect(approved.body.latestRejectionReason).toBeNull();

    const history = await request(app).get(`${TASKS}/${id}/history`).set('Cookie', employee1Cookie);
    expect(
      history.body.data.map(
        (row: { fromStatus: string | null; toStatus: string; actor: { id: string } }) => [
          row.fromStatus,
          row.toStatus,
          row.actor.id,
        ],
      ),
    ).toEqual([
      [null, 'PENDING', admin.id],
      ['PENDING', 'IN_PROGRESS', employee1.id],
      ['IN_PROGRESS', 'PENDING_APPROVAL', employee1.id],
      ['PENDING_APPROVAL', 'IN_PROGRESS', admin.id],
      ['IN_PROGRESS', 'PENDING_APPROVAL', employee1.id],
      ['PENDING_APPROVAL', 'COMPLETED', admin.id],
    ]);
    expect(history.body.data[3].reason).toBe('Needs a chart');

    // COMPLETED is final.
    expect((await act(adminCookie, id, 'reject', { reason: 'reopen' })).status).toBe(409);
    expect((await act(employee1Cookie, id, 'start')).status).toBe(409);
  });
});

describe('[spec #9] status and history roll back together', () => {
  it('a failed history insert (FK on a nonexistent actor) leaves status and history unchanged', async () => {
    const id = await taskFor(employee1, 'PENDING');
    // An actor id with no users row: the conditional status update matches (admin scope), then
    // the history insert violates task_status_history.actorId → users.id, a real DB failure.
    const ghost = { id: 'cghostactor000000000000000', role: 'ADMIN' as const };

    // The FK error proves the status update ran first and the history insert then failed; any
    // other rejection (e.g. an early guard) would mean nothing was rolled back.
    await expect(transitionTask(ghost, id, 'start')).rejects.toMatchObject({
      name: 'PrismaClientKnownRequestError',
      code: 'P2003',
    });

    expect(await taskStatus(id)).toBe('PENDING');
    expect(await historyRows(id)).toEqual([
      { fromStatus: null, toStatus: 'PENDING', actorId: admin.id, reason: null },
    ]);
  });
});

describe('concurrency guard', () => {
  it('two concurrent approvals: exactly one 200 and one 409, one COMPLETED history row', async () => {
    const id = await taskFor(employee1, 'PENDING_APPROVAL');

    const results = await Promise.all([
      act(adminCookie, id, 'approve'),
      act(adminCookie, id, 'approve'),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await taskStatus(id)).toBe('COMPLETED');
    const completed = (await historyRows(id)).filter((row) => row.toStatus === 'COMPLETED');
    expect(completed).toHaveLength(1);
  });

  it('approve racing reject: exactly one wins', async () => {
    const id = await taskFor(employee1, 'PENDING_APPROVAL');

    const results = await Promise.all([
      act(adminCookie, id, 'approve'),
      act(adminCookie, id, 'reject', { reason: 'race' }),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await historyRows(id)).toHaveLength(2);
  });

  it('two concurrent starts: exactly one 200 and one 409, one IN_PROGRESS history row', async () => {
    const id = await taskFor(employee1, 'PENDING');

    const results = await Promise.all([
      act(employee1Cookie, id, 'start'),
      act(employee1Cookie, id, 'start'),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await taskStatus(id)).toBe('IN_PROGRESS');
    const started = (await historyRows(id)).filter((row) => row.toStatus === 'IN_PROGRESS');
    expect(started).toHaveLength(1);
  });
});

describe('workflow request validation', () => {
  it('malformed task id → 400 before any lookup', async () => {
    const res = await act(employee1Cookie, 'not-a-cuid', 'start');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('unexpected body keys on start → 400, status unchanged', async () => {
    const id = await taskFor(employee1, 'PENDING');

    const res = await act(employee1Cookie, id, 'start', { status: 'COMPLETED' });

    expect(res.status).toBe(400);
    expect(await taskStatus(id)).toBe('PENDING');
  });

  it('employee2 can run the workflow on their own task', async () => {
    const id = await taskFor(employee2, 'PENDING');

    expect((await act(employee2Cookie, id, 'start')).status).toBe(200);
  });
});
