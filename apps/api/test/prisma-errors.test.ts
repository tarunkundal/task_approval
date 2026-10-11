import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseDateOnly } from '../src/lib/dates.js';
import { prisma } from '../src/lib/prisma.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { createTestUser, type TestUser } from './helpers/auth.js';
import { UNKNOWN_ID } from './helpers/tasks.js';

// Each route triggers a real Prisma error against the test DB and lets it reach the central
// error handler, which must map it and log only `{ name, code }`.

const SECRET_EMAIL = 'leaky.secret@test.local';
const SECRET_TITLE = 'Top secret title value';

let admin: TestUser;

beforeAll(async () => {
  admin = await createTestUser({
    name: 'Prisma Admin',
    email: SECRET_EMAIL,
    role: 'ADMIN',
    password: 'Password@12345',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function appWith(handler: RequestHandler) {
  const app = express();
  app.get('/boom', handler);
  app.use(errorHandler);
  return app;
}

/** Everything written to console.error during the request, as one string. */
function captureErrorLog() {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return () => JSON.stringify(spy.mock.calls);
}

describe('central handler: Prisma errors', () => {
  it('P2002 unique violation → 409 CONFLICT; the log has no field values', async () => {
    const logged = captureErrorLog();
    const app = appWith(async () => {
      await prisma.user.create({
        data: { name: 'Dup', email: SECRET_EMAIL, role: 'EMPLOYEE', passwordHash: 'x' },
      });
    });

    const res = await request(app).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'CONFLICT', message: 'A record with these values exists' },
    });
    expect(logged()).toContain('P2002');
    expect(logged()).toContain('PrismaClientKnownRequestError');
    expect(logged()).not.toContain(SECRET_EMAIL);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_EMAIL);
  });

  it('P2003 foreign key violation → 400', async () => {
    const logged = captureErrorLog();
    const app = appWith(async () => {
      await prisma.task.create({
        data: {
          title: SECRET_TITLE,
          description: '',
          dueDate: parseDateOnly('2030-01-01'),
          assignedToId: UNKNOWN_ID,
          createdById: admin.id,
        },
      });
    });

    const res = await request(app).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(logged()).toContain('P2003');
    expect(logged()).not.toContain(SECRET_TITLE);
    expect(logged()).not.toContain(UNKNOWN_ID);
  });

  it('P2025 record not found → 404', async () => {
    const logged = captureErrorLog();
    const app = appWith(async () => {
      await prisma.task.update({ where: { id: UNKNOWN_ID }, data: { title: SECRET_TITLE } });
    });

    const res = await request(app).get('/boom');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(logged()).toContain('P2025');
    expect(logged()).not.toContain(SECRET_TITLE);
  });

  it('validation error (bad query arguments) → 500 with name only, no invocation details', async () => {
    const logged = captureErrorLog();
    const app = appWith(async () => {
      await prisma.task.findMany({
        // Deliberately invalid at runtime: Prisma echoes arguments in its message.
        where: { title: { equals: { secret: SECRET_TITLE } as unknown as string } },
      });
    });

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
    expect(logged()).toContain('PrismaClientValidationError');
    expect(logged()).not.toContain(SECRET_TITLE);
    expect(logged()).not.toContain('findMany');
  });
});
