import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { BCRYPT_COST } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import { createTestUser, loginCookie, type TestUser } from './helpers/auth.js';

const USERS = '/api/v1/users';

let admin: TestUser;
let zoe: TestUser;
let adam: TestUser;

beforeAll(async () => {
  admin = await createTestUser({
    name: 'Admin User',
    email: 'admin@test.local',
    role: 'ADMIN',
    password: 'Admin@12345',
  });
  zoe = await createTestUser({
    name: 'Zoe Employee',
    email: 'zoe@test.local',
    role: 'EMPLOYEE',
    password: 'Employee@12345',
  });
  adam = await createTestUser({
    name: 'Adam Employee',
    email: 'adam@test.local',
    role: 'EMPLOYEE',
    password: 'Employee@12345',
  });
});

describe('GET /api/v1/users (admin only)', () => {
  it('returns 401 without authentication', async () => {
    const res = await request(createApp()).get(USERS);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 403 for an employee', async () => {
    const app = createApp();
    const res = await request(app)
      .get(USERS)
      .set('Cookie', await loginCookie(app, zoe));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' },
    });
  });

  it('returns employees only, ordered by name, without password hashes', async () => {
    const app = createApp();
    const res = await request(app)
      .get(USERS)
      .set('Cookie', await loginCookie(app, admin));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        { id: adam.id, name: adam.name, email: adam.email, role: 'EMPLOYEE' },
        { id: zoe.id, name: zoe.name, email: zoe.email, role: 'EMPLOYEE' },
      ],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });
});

describe('POST /api/v1/users (admin creates employees)', () => {
  const newUser = (overrides: Record<string, unknown> = {}) => ({
    name: '  New Hire ',
    email: '  New.Hire@Test.Local ',
    password: 'Welcome@12345',
    ...overrides,
  });

  it('creates an EMPLOYEE with a bcrypt hash at BCRYPT_COST and returns the safe DTO', async () => {
    const app = createApp();
    const res = await request(app)
      .post(USERS)
      .set('Cookie', await loginCookie(app, admin))
      .send(newUser());

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'New Hire',
      email: 'new.hire@test.local',
      role: 'EMPLOYEE',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password|\$2[aby]\$/);

    const row = await prisma.user.findUnique({ where: { email: 'new.hire@test.local' } });
    expect(row?.role).toBe('EMPLOYEE');
    expect(row?.passwordHash).not.toBe('Welcome@12345');
    expect(bcrypt.getRounds(row!.passwordHash)).toBe(BCRYPT_COST);
    expect(await bcrypt.compare('Welcome@12345', row!.passwordHash)).toBe(true);

    // The new account can log in.
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'new.hire@test.local', password: 'Welcome@12345' });
    expect(login.status).toBe(200);
    expect(login.body.role).toBe('EMPLOYEE');
  });

  it('rejects a role in the body with 400 (no admin creation through the API)', async () => {
    const app = createApp();
    const res = await request(app)
      .post(USERS)
      .set('Cookie', await loginCookie(app, admin))
      .send(newUser({ email: 'wannabe@test.local', role: 'ADMIN' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.user.findUnique({ where: { email: 'wannabe@test.local' } })).toBeNull();
  });

  it('duplicate email (case-insensitive after normalization) → 409 EMAIL_TAKEN', async () => {
    const app = createApp();
    const res = await request(app)
      .post(USERS)
      .set('Cookie', await loginCookie(app, admin))
      .send(newUser({ email: 'ZOE@test.local' }));

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'EMAIL_TAKEN', message: 'A user with this email already exists' },
    });
  });

  it('employee caller → 403; unauthenticated → 401', async () => {
    const app = createApp();
    const asEmployee = await request(app)
      .post(USERS)
      .set('Cookie', await loginCookie(app, zoe))
      .send(newUser({ email: 'by-employee@test.local' }));
    const anonymous = await request(app)
      .post(USERS)
      .send(newUser({ email: 'anon@test.local' }));

    expect(asEmployee.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(
      await prisma.user.count({
        where: { email: { in: ['by-employee@test.local', 'anon@test.local'] } },
      }),
    ).toBe(0);
  });

  it.each([
    ['password under 8 characters', { password: 'short' }],
    // 25 × "€" (3 bytes each) = 75 bytes but only 25 characters.
    ['password over 72 UTF-8 bytes', { password: '€'.repeat(25) }],
    ['invalid email', { email: 'not-an-email' }],
    ['empty name', { name: '   ' }],
    ['unknown key', { department: 'Ops' }],
  ])('%s → 400', async (_name, overrides) => {
    const app = createApp();
    const res = await request(app)
      .post(USERS)
      .set('Cookie', await loginCookie(app, admin))
      .send(newUser({ email: 'invalid-case@test.local', ...overrides }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a 72-byte multibyte password', async () => {
    const app = createApp();
    const res = await request(app)
      .post(USERS)
      .set('Cookie', await loginCookie(app, admin))
      .send(newUser({ email: 'bytes@test.local', password: '€'.repeat(24) }));

    expect(res.status).toBe(201);
  });
});
