import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { createTestUser, loginCookie, type TestUser } from './helpers/auth.js';
import { createTaskRow, createTestApp, taskStatus, UNKNOWN_ID } from './helpers/tasks.js';

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
    email: 'admin@c.local',
    role: 'ADMIN',
    password,
  });
  employee1 = await createTestUser({
    name: 'Eli One',
    email: 'e1@c.local',
    role: 'EMPLOYEE',
    password,
  });
  employee2 = await createTestUser({
    name: 'Eve Two',
    email: 'e2@c.local',
    role: 'EMPLOYEE',
    password,
  });
  adminCookie = await loginCookie(app, admin);
  employee1Cookie = await loginCookie(app, employee1);
  employee2Cookie = await loginCookie(app, employee2);
});

const taskFor = (assignee: TestUser, status: 'PENDING' | 'IN_PROGRESS' = 'PENDING') =>
  createTaskRow({ assignedToId: assignee.id, createdById: admin.id, status });

describe("[spec #5] employee 1 cannot access employee 2's task", () => {
  it('detail, comments, history, start, submit and POST comment all → 404', async () => {
    const pending = await taskFor(employee2, 'PENDING');
    const inProgress = await taskFor(employee2, 'IN_PROGRESS');
    const notFound = { error: { code: 'NOT_FOUND', message: 'Task not found' } };

    const responses = await Promise.all([
      request(app).get(`${TASKS}/${pending}`).set('Cookie', employee1Cookie),
      request(app).get(`${TASKS}/${pending}/comments`).set('Cookie', employee1Cookie),
      request(app).get(`${TASKS}/${pending}/history`).set('Cookie', employee1Cookie),
      request(app).post(`${TASKS}/${pending}/start`).set('Cookie', employee1Cookie),
      request(app).post(`${TASKS}/${inProgress}/submit`).set('Cookie', employee1Cookie),
      request(app)
        .post(`${TASKS}/${pending}/comments`)
        .set('Cookie', employee1Cookie)
        .send({ body: 'sneaky' }),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual(notFound);
    }
    expect(await taskStatus(pending)).toBe('PENDING');
    expect(await taskStatus(inProgress)).toBe('IN_PROGRESS');
    expect(await prisma.taskComment.count({ where: { taskId: pending } })).toBe(0);

    // The owner still has access, so the 404s above are about scope, not a broken task.
    const owner = await request(app)
      .get(`${TASKS}/${pending}/history`)
      .set('Cookie', employee2Cookie);
    expect(owner.status).toBe(200);
  });

  it("GET /tasks?assignedToId=<employee2> as employee1 returns none of employee2's tasks", async () => {
    const own = await taskFor(employee1);
    const others = await taskFor(employee2);

    const filtered = await request(app)
      .get(TASKS)
      .query({ assignedToId: employee2.id })
      .set('Cookie', employee1Cookie);
    const unfiltered = await request(app).get(TASKS).set('Cookie', employee1Cookie);

    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toEqual([]);
    expect(filtered.body.meta.total).toBe(0);
    const ids = unfiltered.body.data.map((task: { id: string }) => task.id);
    expect(ids).toContain(own);
    expect(ids).not.toContain(others);
    expect(
      unfiltered.body.data.every(
        (task: { assignedTo: { id: string } }) => task.assignedTo.id === employee1.id,
      ),
    ).toBe(true);
  });
});

describe('comments', () => {
  it('assignee and admin add comments; both read them oldest first with safe author fields', async () => {
    const id = await taskFor(employee1);

    const first = await request(app)
      .post(`${TASKS}/${id}/comments`)
      .set('Cookie', employee1Cookie)
      .send({ body: '  Started on the draft.  ' });
    const second = await request(app)
      .post(`${TASKS}/${id}/comments`)
      .set('Cookie', adminCookie)
      .send({ body: 'Thanks, looks good.' });

    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      id: expect.any(String),
      body: 'Started on the draft.',
      author: { id: employee1.id, name: employee1.name, role: 'EMPLOYEE' },
      createdAt: expect.any(String),
    });
    expect(second.status).toBe(201);

    for (const cookie of [employee1Cookie, adminCookie]) {
      const res = await request(app).get(`${TASKS}/${id}/comments`).set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.map((c: { body: string }) => c.body)).toEqual([
        'Started on the draft.',
        'Thanks, looks good.',
      ]);
      expect(res.body.data[1].author).toEqual({ id: admin.id, name: admin.name, role: 'ADMIN' });
      expect(JSON.stringify(res.body)).not.toMatch(/email|passwordHash|\$2[aby]\$/);
    }
  });

  it.each([
    ['empty', { body: '' }],
    ['whitespace only', { body: '   \n\t ' }],
    ['over 2000 characters', { body: 'x'.repeat(2001) }],
    ['missing body', {}],
    ['unknown key', { body: 'ok', authorId: 'cfakeauthor00000000000000' }],
  ])('%s comment → 400 and nothing stored', async (_name, payload) => {
    const id = await taskFor(employee1);

    const res = await request(app)
      .post(`${TASKS}/${id}/comments`)
      .set('Cookie', employee1Cookie)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.taskComment.count({ where: { taskId: id } })).toBe(0);
  });

  it('accepts exactly 2000 characters', async () => {
    const id = await taskFor(employee1);
    const res = await request(app)
      .post(`${TASKS}/${id}/comments`)
      .set('Cookie', employee1Cookie)
      .send({ body: 'x'.repeat(2000) });

    expect(res.status).toBe(201);
  });

  it('deleted or unknown tasks → 404 for comments and history', async () => {
    const deleted = await createTaskRow({
      assignedToId: employee1.id,
      createdById: admin.id,
      deletedAt: new Date(),
    });

    for (const id of [deleted, UNKNOWN_ID]) {
      expect(
        (await request(app).get(`${TASKS}/${id}/comments`).set('Cookie', adminCookie)).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .post(`${TASKS}/${id}/comments`)
            .set('Cookie', adminCookie)
            .send({ body: 'x' })
        ).status,
      ).toBe(404);
      expect(
        (await request(app).get(`${TASKS}/${id}/history`).set('Cookie', adminCookie)).status,
      ).toBe(404);
    }
  });

  it('there are no edit or delete endpoints for comments or history', async () => {
    const id = await taskFor(employee1);
    const res = await request(app)
      .post(`${TASKS}/${id}/comments`)
      .set('Cookie', adminCookie)
      .send({ body: 'keep me' });
    const commentId = res.body.id as string;

    const patch = await request(app)
      .patch(`${TASKS}/${id}/comments/${commentId}`)
      .set('Cookie', adminCookie)
      .send({ body: 'edited' });
    const del = await request(app)
      .delete(`${TASKS}/${id}/comments/${commentId}`)
      .set('Cookie', adminCookie);
    const delHistory = await request(app)
      .delete(`${TASKS}/${id}/history`)
      .set('Cookie', adminCookie);

    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
    expect(delHistory.status).toBe(404);
    expect((await prisma.taskComment.findUnique({ where: { id: commentId } }))?.body).toBe(
      'keep me',
    );
  });
});

describe('history', () => {
  it('lists rows oldest first with actor { id, name, role } and no email', async () => {
    const id = await taskFor(employee1);
    await request(app).post(`${TASKS}/${id}/start`).set('Cookie', employee1Cookie);
    await request(app).post(`${TASKS}/${id}/submit`).set('Cookie', employee1Cookie);

    const res = await request(app).get(`${TASKS}/${id}/history`).set('Cookie', employee1Cookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        id: expect.any(String),
        fromStatus: null,
        toStatus: 'PENDING',
        reason: null,
        actor: { id: admin.id, name: admin.name, role: 'ADMIN' },
        createdAt: expect.any(String),
      },
      expect.objectContaining({
        fromStatus: 'PENDING',
        toStatus: 'IN_PROGRESS',
        actor: { id: employee1.id, name: employee1.name, role: 'EMPLOYEE' },
      }),
      expect.objectContaining({ fromStatus: 'IN_PROGRESS', toStatus: 'PENDING_APPROVAL' }),
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/email|passwordHash/);
  });
});
