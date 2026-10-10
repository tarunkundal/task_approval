import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
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
