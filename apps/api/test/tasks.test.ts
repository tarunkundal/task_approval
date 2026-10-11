import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { createTestUser, loginCookie, type TestUser } from './helpers/auth.js';
import {
  createTaskRow,
  createTestApp,
  historyRows,
  taskStatus,
  UNKNOWN_ID,
} from './helpers/tasks.js';

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
    email: 'admin@t.local',
    role: 'ADMIN',
    password,
  });
  employee1 = await createTestUser({
    name: 'Eli One',
    email: 'e1@t.local',
    role: 'EMPLOYEE',
    password,
  });
  employee2 = await createTestUser({
    name: 'Eve Two',
    email: 'e2@t.local',
    role: 'EMPLOYEE',
    password,
  });
  adminCookie = await loginCookie(app, admin);
  employee1Cookie = await loginCookie(app, employee1);
  employee2Cookie = await loginCookie(app, employee2);
});

const validBody = () => ({
  title: '  Write the quarterly report  ',
  description: 'Summarize Q3 results.',
  priority: 'HIGH',
  dueDate: '2030-05-01',
  assignedToId: employee1.id,
});

const fixture = (overrides: Partial<Parameters<typeof createTaskRow>[0]> = {}) =>
  createTaskRow({ assignedToId: employee1.id, createdById: admin.id, ...overrides });

describe('[spec #1] unauthenticated access to task endpoints', () => {
  it('GET /tasks without a cookie → 401', async () => {
    const res = await request(app).get(TASKS);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    });
  });

  it('GET /tasks/:id without a cookie → 401 (even for an existing task)', async () => {
    const id = await fixture();
    const res = await request(app).get(`${TASKS}/${id}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('POST /tasks and workflow actions without a cookie → 401', async () => {
    const id = await fixture();
    expect((await request(app).post(TASKS).send(validBody())).status).toBe(401);
    expect((await request(app).post(`${TASKS}/${id}/start`)).status).toBe(401);
    expect((await request(app).get('/api/v1/dashboard/summary')).status).toBe(401);
    expect(await taskStatus(id)).toBe('PENDING');
  });
});

describe('POST /api/v1/tasks', () => {
  it('admin creates a PENDING task with a creation history row', async () => {
    const res = await request(app).post(TASKS).set('Cookie', adminCookie).send(validBody());

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      title: 'Write the quarterly report',
      description: 'Summarize Q3 results.',
      priority: 'HIGH',
      status: 'PENDING',
      dueDate: '2030-05-01',
      assignedTo: { id: employee1.id, name: employee1.name, email: employee1.email },
      createdBy: { id: admin.id, name: admin.name, email: admin.email },
      reviewedBy: null,
      reviewedAt: null,
      latestRejectionReason: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|deletedAt|\$2[aby]\$/);
    expect(await historyRows(res.body.id)).toEqual([
      { fromStatus: null, toStatus: 'PENDING', actorId: admin.id, reason: null },
    ]);
  });

  it('defaults description to an empty string', async () => {
    const { description: _omit, ...body } = validBody();
    const res = await request(app).post(TASKS).set('Cookie', adminCookie).send(body);

    expect(res.status).toBe(201);
    expect(res.body.description).toBe('');
  });

  it('stores the due date as a calendar date without timezone shift', async () => {
    const res = await request(app)
      .post(TASKS)
      .set('Cookie', adminCookie)
      .send({ ...validBody(), dueDate: '2030-12-31' });

    expect(res.body.dueDate).toBe('2030-12-31');
    const row = await prisma.task.findUnique({ where: { id: res.body.id } });
    expect(row?.dueDate.toISOString()).toBe('2030-12-31T00:00:00.000Z');
  });

  it('employee → 403 and no task is created', async () => {
    const before = await prisma.task.count();
    const res = await request(app).post(TASKS).set('Cookie', employee1Cookie).send(validBody());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(await prisma.task.count()).toBe(before);
  });
});

describe('[spec #7] invalid task inputs are rejected with 400', () => {
  const invalidBodies: [string, () => Record<string, unknown>][] = [
    ['empty title', () => ({ ...validBody(), title: '' })],
    ['whitespace-only title', () => ({ ...validBody(), title: '    ' })],
    ['title over 200 characters', () => ({ ...validBody(), title: 'x'.repeat(201) })],
    ['description over 5000 characters', () => ({ ...validBody(), description: 'x'.repeat(5001) })],
    ['unknown priority', () => ({ ...validBody(), priority: 'URGENT' })],
    ['non-existent calendar date 2026-02-30', () => ({ ...validBody(), dueDate: '2026-02-30' })],
    ['non-ISO date 10/10/2026', () => ({ ...validBody(), dueDate: '10/10/2026' })],
    ['datetime instead of date', () => ({ ...validBody(), dueDate: '2030-05-01T00:00:00Z' })],
    ['unknown key', () => ({ ...validBody(), foo: 'bar' })],
    ['status in body', () => ({ ...validBody(), status: 'COMPLETED' })],
    ['createdById in body', () => ({ ...validBody(), createdById: employee1.id })],
    [
      'missing assignee',
      () => {
        const { assignedToId: _omit, ...rest } = validBody();
        return rest;
      },
    ],
    ['malformed assignee id', () => ({ ...validBody(), assignedToId: 'not a cuid' })],
  ];

  it.each(invalidBodies)('%s → 400 VALIDATION_ERROR, nothing created', async (_name, body) => {
    const before = await prisma.task.count();
    const res = await request(app).post(TASKS).set('Cookie', adminCookie).send(body());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(expect.any(Array));
    expect(await prisma.task.count()).toBe(before);
  });

  it('nonexistent assignee → 400 INVALID_ASSIGNEE', async () => {
    const before = await prisma.task.count();
    const res = await request(app)
      .post(TASKS)
      .set('Cookie', adminCookie)
      .send({ ...validBody(), assignedToId: UNKNOWN_ID });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'INVALID_ASSIGNEE', message: 'Assignee must be an existing employee' },
    });
    expect(await prisma.task.count()).toBe(before);
  });

  it('ADMIN as assignee → 400 INVALID_ASSIGNEE', async () => {
    const res = await request(app)
      .post(TASKS)
      .set('Cookie', adminCookie)
      .send({ ...validBody(), assignedToId: admin.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
  });
});

describe('GET /api/v1/tasks/:id', () => {
  it('admin sees any task; the assignee sees their own', async () => {
    const id = await fixture({ title: 'Visible task' });

    const asAdmin = await request(app).get(`${TASKS}/${id}`).set('Cookie', adminCookie);
    const asOwner = await request(app).get(`${TASKS}/${id}`).set('Cookie', employee1Cookie);

    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.title).toBe('Visible task');
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.id).toBe(id);
  });

  it("another employee's task → 404 (existence not disclosed)", async () => {
    const id = await fixture();
    const res = await request(app).get(`${TASKS}/${id}`).set('Cookie', employee2Cookie);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
  });

  it('unknown id → 404; malformed id → 400', async () => {
    const unknown = await request(app).get(`${TASKS}/${UNKNOWN_ID}`).set('Cookie', adminCookie);
    const malformed = await request(app).get(`${TASKS}/not-a-cuid`).set('Cookie', adminCookie);

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/v1/tasks/:id', () => {
  it('admin edits whitelisted fields; status is unchanged and no history row is added', async () => {
    const id = await fixture({ status: 'IN_PROGRESS' });
    const res = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Cookie', adminCookie)
      .send({ title: ' Renamed ', priority: 'LOW', dueDate: '2031-01-02', description: 'New' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Renamed',
      priority: 'LOW',
      dueDate: '2031-01-02',
      description: 'New',
      status: 'IN_PROGRESS',
    });
    expect(await historyRows(id)).toHaveLength(1);
  });

  const forbiddenPatches: [string, () => Record<string, unknown>][] = [
    ['status', () => ({ status: 'COMPLETED' })],
    ['createdById', () => ({ createdById: employee1.id })],
    ['reviewedById', () => ({ reviewedById: admin.id })],
    ['reviewedAt', () => ({ reviewedAt: '2030-01-01T00:00:00.000Z' })],
    ['deletedAt', () => ({ deletedAt: '2030-01-01T00:00:00.000Z' })],
    ['an unknown key', () => ({ title: 'Ok', foo: 'bar' })],
    ['an empty body', () => ({})],
    ['an invalid date', () => ({ dueDate: '2026-02-30' })],
  ];

  it.each(forbiddenPatches)('with %s → 400 and the DB row is unchanged', async (_name, body) => {
    const id = await fixture({ status: 'PENDING_APPROVAL', title: 'Untouched' });
    const before = await prisma.task.findUnique({ where: { id } });

    const res = await request(app).patch(`${TASKS}/${id}`).set('Cookie', adminCookie).send(body());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.task.findUnique({ where: { id } })).toEqual(before);
  });

  it('employee → 403 and the row is unchanged', async () => {
    const id = await fixture({ title: 'Mine' });
    const res = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Cookie', employee1Cookie)
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
    expect((await prisma.task.findUnique({ where: { id } }))?.title).toBe('Mine');
  });

  it('COMPLETED task → 409 TASK_COMPLETED', async () => {
    const id = await fixture({ status: 'COMPLETED', title: 'Done' });
    const res = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Cookie', adminCookie)
      .send({ title: 'Changed' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_COMPLETED');
    expect((await prisma.task.findUnique({ where: { id } }))?.title).toBe('Done');
  });

  it('reassigning to an ADMIN or an unknown user → 400 INVALID_ASSIGNEE', async () => {
    const id = await fixture();
    for (const assignedToId of [admin.id, UNKNOWN_ID]) {
      const res = await request(app)
        .patch(`${TASKS}/${id}`)
        .set('Cookie', adminCookie)
        .send({ assignedToId });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
    }
    expect((await prisma.task.findUnique({ where: { id } }))?.assignedToId).toBe(employee1.id);
  });

  it('reassigning to employee2 keeps the status; employee1 loses access (404)', async () => {
    const id = await fixture({ status: 'IN_PROGRESS' });
    const res = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Cookie', adminCookie)
      .send({ assignedToId: employee2.id });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(res.body.assignedTo.id).toBe(employee2.id);
    expect((await request(app).get(`${TASKS}/${id}`).set('Cookie', employee1Cookie)).status).toBe(
      404,
    );
    expect((await request(app).get(`${TASKS}/${id}`).set('Cookie', employee2Cookie)).status).toBe(
      200,
    );
  });

  it('unknown task → 404', async () => {
    const res = await request(app)
      .patch(`${TASKS}/${UNKNOWN_ID}`)
      .set('Cookie', adminCookie)
      .send({ title: 'x' });

    expect(res.status).toBe(404);
  });
});

/**
 * Applies `data` to the task in a transaction that keeps the row lock until `commit()`, so a
 * PATCH started meanwhile has to wait for it and then sees the committed change.
 */
async function holdRowChange(id: string, data: Parameters<typeof prisma.task.update>[0]['data']) {
  let commit!: () => void;
  let locked!: () => void;
  const committed = new Promise<void>((resolve) => (commit = resolve));
  const isLocked = new Promise<void>((resolve) => (locked = resolve));
  const done = prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data });
    locked();
    await committed;
  });
  await isLocked;
  return { commit, done };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('PATCH racing a concurrent approve or delete', () => {
  // Without the fix, the PATCH read the task before blocking on the lock and answered 200 from
  // that stale snapshot. Whatever the timing, the PATCH must now report the committed change.
  it('approval commits while the PATCH waits → 409 TASK_COMPLETED, edit not applied', async () => {
    const id = await fixture({ status: 'PENDING_APPROVAL', title: 'Before' });
    const approval = await holdRowChange(id, {
      status: 'COMPLETED',
      reviewedById: admin.id,
      reviewedAt: new Date(),
    });

    const pending = request(app)
      .patch(`${TASKS}/${id}`)
      .set('Cookie', adminCookie)
      .send({ title: 'Too late' })
      .then((res) => res);
    await sleep(300); // let the PATCH reach its UPDATE, which waits on the row lock
    approval.commit();
    await approval.done;
    const res = await pending;

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_COMPLETED');
    const row = await prisma.task.findUnique({ where: { id } });
    expect(row).toMatchObject({ status: 'COMPLETED', title: 'Before' });
  });

  it('soft delete commits while the PATCH waits → 404, edit not applied', async () => {
    const id = await fixture({ title: 'Before' });
    const deletion = await holdRowChange(id, { deletedAt: new Date() });

    const pending = request(app)
      .patch(`${TASKS}/${id}`)
      .set('Cookie', adminCookie)
      .send({ title: 'Too late' })
      .then((res) => res);
    await sleep(300);
    deletion.commit();
    await deletion.done;
    const res = await pending;

    expect(res.status).toBe(404);
    expect((await prisma.task.findUnique({ where: { id } }))?.title).toBe('Before');
  });
});

describe('DELETE /api/v1/tasks/:id (soft delete)', () => {
  it('204, then hidden from detail and list; history rows are kept', async () => {
    const id = await fixture({ title: 'To be deleted' });

    const res = await request(app).delete(`${TASKS}/${id}`).set('Cookie', adminCookie);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await prisma.task.findUnique({ where: { id } }))?.deletedAt).toBeInstanceOf(Date);
    expect((await request(app).get(`${TASKS}/${id}`).set('Cookie', adminCookie)).status).toBe(404);
    const list = await request(app)
      .get(TASKS)
      .query({ q: 'To be deleted' })
      .set('Cookie', adminCookie);
    expect(list.body.data).toEqual([]);
    expect(await historyRows(id)).toHaveLength(1);
  });

  it('already deleted or unknown → 404', async () => {
    const id = await fixture({ deletedAt: new Date() });

    expect((await request(app).delete(`${TASKS}/${id}`).set('Cookie', adminCookie)).status).toBe(
      404,
    );
    expect(
      (await request(app).delete(`${TASKS}/${UNKNOWN_ID}`).set('Cookie', adminCookie)).status,
    ).toBe(404);
  });

  it('deleted tasks reject edits and transitions with 404', async () => {
    const id = await fixture({ status: 'PENDING_APPROVAL', deletedAt: new Date() });

    const patch = await request(app)
      .patch(`${TASKS}/${id}`)
      .set('Cookie', adminCookie)
      .send({ title: 'x' });
    const approve = await request(app).post(`${TASKS}/${id}/approve`).set('Cookie', adminCookie);

    expect(patch.status).toBe(404);
    expect(approve.status).toBe(404);
    expect(await taskStatus(id)).toBe('PENDING_APPROVAL');
  });

  it('employee → 403 and the task stays', async () => {
    const id = await fixture();
    const res = await request(app).delete(`${TASKS}/${id}`).set('Cookie', employee1Cookie);

    expect(res.status).toBe(403);
    expect((await prisma.task.findUnique({ where: { id } }))?.deletedAt).toBeNull();
  });
});
