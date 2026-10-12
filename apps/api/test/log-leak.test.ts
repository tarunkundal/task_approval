import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getEnv } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { allowedOrigin, createTestUser, loginCookie, type TestUser } from './helpers/auth.js';
import { createTaskRow, createTestApp, UNKNOWN_ID } from './helpers/tasks.js';

/**
 * Spec §7: no stack traces, password hashes, tokens or secrets in API errors or logs.
 * Drives the real app through its failure paths (bad login, validation, 401/403/404/409,
 * malformed JSON, forced Prisma and unexpected errors) while capturing every console call, then
 * searches the logs and the response bodies for anything sensitive.
 */

const TASKS = '/api/v1/tasks';
const logged: unknown[][] = [];
const bodies: string[] = [];

let admin: TestUser;
let employee: TestUser;
let adminCookie: string;
let employeeCookie: string;
let hashes: string[];

function record(res: request.Response): request.Response {
  bodies.push(res.text ?? '');
  return res;
}

beforeAll(async () => {
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
  }
  admin = await createTestUser({
    name: 'Leak Admin',
    email: 'leak.admin@test.local',
    role: 'ADMIN',
    password: 'Password@12345',
  });
  employee = await createTestUser({
    name: 'Leak Employee',
    email: 'leak.employee@test.local',
    role: 'EMPLOYEE',
    password: 'Password@12345',
  });
  hashes = (await prisma.user.findMany({ select: { passwordHash: true } })).map(
    (user) => user.passwordHash,
  );
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('logs and error bodies leak nothing sensitive', () => {
  it('after every failure path, no hash, token, secret or stack appears', async () => {
    const app = createTestApp();
    adminCookie = await loginCookie(app, admin);
    employeeCookie = await loginCookie(app, employee);
    const token = adminCookie.split('=')[1] as string;
    const pending = await createTaskRow({ assignedToId: employee.id, createdById: admin.id });
    const origin = allowedOrigin();

    // Failed logins: unknown email and wrong password.
    for (const email of [admin.email, 'nobody@test.local']) {
      const res = record(
        await request(app)
          .post('/api/v1/auth/login')
          .set('Origin', origin)
          .send({ email, password: 'wrong-password' }),
      );
      expect(res.status).toBe(401);
    }
    // 400 validation (body, params, query), malformed JSON, 401, 403, 404, 409, CSRF 403.
    const cases: [request.Test, number][] = [
      [request(app).post(TASKS).set('Cookie', adminCookie).send({ title: '' }), 400],
      [request(app).get(`${TASKS}/not-a-cuid`).set('Cookie', adminCookie), 400],
      [request(app).get(`${TASKS}?pageSize=1000`).set('Cookie', adminCookie), 400],
      [
        request(app)
          .post(TASKS)
          .set('Cookie', adminCookie)
          .set('Content-Type', 'application/json')
          .send('{"title": '),
        400,
      ],
      [
        request(app)
          .patch(`${TASKS}/${pending}`)
          .set('Cookie', adminCookie)
          .send({ assignedToId: UNKNOWN_ID }),
        400,
      ],
      [request(app).get(TASKS), 401],
      [request(app).get(TASKS).set('Cookie', `tas_token=${token}tampered`), 401],
      [request(app).post(`${TASKS}/${pending}/approve`).set('Cookie', employeeCookie), 403],
      [request(app).get('/api/v1/users').set('Cookie', employeeCookie), 403],
      [request(app).get(`${TASKS}/${UNKNOWN_ID}`).set('Cookie', adminCookie), 404],
      [request(app).get('/api/v1/nope').set('Cookie', adminCookie), 404],
      [request(app).post(`${TASKS}/${pending}/approve`).set('Cookie', adminCookie), 409],
      [
        request(app)
          .post(`${TASKS}/${pending}/start`)
          .set('Cookie', employeeCookie)
          .set('Origin', 'https://evil.example'),
        403,
      ],
    ];
    for (const [req, status] of cases) {
      const res = record(await req);
      expect(res.status).toBe(status);
      expect(res.body.error).toEqual(
        expect.objectContaining({ code: expect.any(String), message: expect.any(String) }),
      );
    }

    // Forced Prisma error whose message would echo a password hash, and an unexpected error
    // with a stack trace, both through the central handler.
    const boom = express();
    boom.get('/prisma', async () => {
      await prisma.user.findMany({
        where: { passwordHash: { equals: { leaked: hashes[0] } as unknown as string } },
      });
    });
    boom.get('/unexpected', () => {
      throw new Error('Unexpected failure');
    });
    boom.use(errorHandler);
    for (const path of ['/prisma', '/unexpected']) {
      const res = record(await request(boom).get(path));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      });
    }

    const env = getEnv();
    const dbPassword = decodeURIComponent(new URL(env.DATABASE_URL).password);
    const logText = JSON.stringify(logged);
    // Sanity: the failure paths above did write to the log, so the search below is meaningful.
    expect(logText).toContain('PrismaClientValidationError');
    expect(logText).toContain('Unexpected failure');

    for (const [where, text] of [
      ['logs', logText],
      ['response bodies', bodies.join('\n')],
    ] as const) {
      expect(text, where).not.toContain('passwordHash');
      expect(text, where).not.toMatch(/\$2[aby]\$\d\d\$/);
      for (const hash of hashes) expect(text, where).not.toContain(hash);
      expect(text, where).not.toContain(token);
      expect(text, where).not.toContain('eyJ');
      expect(text, where).not.toContain(env.JWT_SECRET);
      if (dbPassword) expect(text, where).not.toContain(dbPassword);
      expect(text, where).not.toContain(env.DATABASE_URL);
      // Stack frames ("    at fn (file.ts:1:2)") and source paths.
      expect(text, where).not.toMatch(/\bat .+:\d+:\d+/);
      expect(text, where).not.toMatch(/\.(ts|js):\d+/);
      expect(text, where).not.toMatch(/"stack"/);
    }
  });
});
