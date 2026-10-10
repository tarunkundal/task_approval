import { SignJWT, UnsecuredJWT } from 'jose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getEnv } from '../src/config/env.js';
import { AUTH_COOKIE } from '../src/lib/auth-cookie.js';
import { signAccessToken } from '../src/lib/jwt.js';
import { prisma } from '../src/lib/prisma.js';
import { authSetCookie, createTestUser, loginCookie, type TestUser } from './helpers/auth.js';

const LOGIN = '/api/v1/auth/login';
const ME = '/api/v1/auth/me';
const LOGOUT = '/api/v1/auth/logout';

let admin: TestUser;
let employee: TestUser;

beforeAll(async () => {
  admin = await createTestUser({
    name: 'Test Admin',
    email: 'admin@test.local',
    role: 'ADMIN',
    password: 'Admin@12345',
  });
  employee = await createTestUser({
    name: 'Test Employee',
    email: 'employee@test.local',
    role: 'EMPLOYEE',
    password: 'Employee@12345',
  });
});

const tokenCookie = (token: string) => `${AUTH_COOKIE}=${token}`;
const secretKey = (secret: string) => new TextEncoder().encode(secret);

describe('POST /api/v1/auth/login', () => {
  it('returns the safe user DTO and sets an httpOnly, SameSite=Lax cookie', async () => {
    const res = await request(createApp())
      .post(LOGIN)
      .send({ email: '  Employee@Test.Local ', password: employee.password });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: 'EMPLOYEE',
    });
    expect(res.headers['cache-control']).toBe('no-store');

    const cookie = authSetCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; Max-Age=28800(;|$)/); // JWT_EXPIRES_IN=8h in .env.test
    expect(cookie).not.toMatch(/; Secure/);

    // The token travels only in the cookie, never in the body.
    const token = cookie!.split(';')[0]!.slice(AUTH_COOKIE.length + 1);
    expect(JSON.stringify(res.body)).not.toContain(token);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('sets the Secure flag when NODE_ENV=production', async () => {
    const app = createApp({ env: { ...getEnv(), NODE_ENV: 'production' } });
    const res = await request(app)
      .post(LOGIN)
      .send({ email: employee.email, password: employee.password });

    expect(res.status).toBe(200);
    expect(authSetCookie(res)).toMatch(/; Secure/);
  });

  it('returns the same 401 for a wrong password and for an unknown email', async () => {
    const app = createApp();
    const wrongPassword = await request(app)
      .post(LOGIN)
      .send({ email: employee.email, password: 'not-the-password' });
    const unknownEmail = await request(app)
      .post(LOGIN)
      .send({ email: 'nobody@test.local', password: 'not-the-password' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(authSetCookie(wrongPassword)).toBeUndefined();
    expect(authSetCookie(unknownEmail)).toBeUndefined();
  });

  it('rejects an invalid body with 400 and field details', async () => {
    const res = await request(createApp()).post(LOGIN).send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'email' }),
        expect.objectContaining({ path: 'password' }),
      ]),
    );
  });

  it('rejects unknown fields such as role (strict schema)', async () => {
    const res = await request(createApp())
      .post(LOGIN)
      .send({ email: employee.email, password: employee.password, role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the current user for a valid cookie', async () => {
    const app = createApp();
    const cookie = await loginCookie(app, admin);
    const res = await request(app).get(ME).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: admin.id, name: admin.name, email: admin.email, role: 'ADMIN' });
  });

  it('returns 401 without a cookie', async () => {
    const res = await request(createApp()).get(ME);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    });
  });

  it('returns 401 and clears the cookie for a tampered token', async () => {
    const app = createApp();
    const cookie = await loginCookie(app, employee);
    const [header, , signature] = cookie.slice(AUTH_COOKIE.length + 1).split('.');
    // Same signature, payload swapped to claim the ADMIN role.
    const forgedPayload = Buffer.from(
      JSON.stringify({
        sub: employee.id,
        role: 'ADMIN',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const res = await request(app)
      .get(ME)
      .set('Cookie', tokenCookie(`${header}.${forgedPayload}.${signature}`));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(authSetCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('returns 401 for a token signed with another secret', async () => {
    const token = await signAccessToken(
      { sub: admin.id, role: 'ADMIN' },
      'another-secret-that-is-at-least-32-characters-long',
      3600,
    );
    const res = await request(createApp()).get(ME).set('Cookie', tokenCookie(token));

    expect(res.status).toBe(401);
  });

  it('returns 401 for an unsigned alg=none token', async () => {
    const token = new UnsecuredJWT({ role: 'ADMIN' })
      .setSubject(admin.id)
      .setExpirationTime('1h')
      .encode();
    const res = await request(createApp()).get(ME).set('Cookie', tokenCookie(token));

    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.id)
      .setIssuedAt(now - 7200)
      .setExpirationTime(now - 60)
      .sign(secretKey(getEnv().JWT_SECRET));
    const res = await request(createApp()).get(ME).set('Cookie', tokenCookie(token));

    expect(res.status).toBe(401);
  });

  it('returns 401 for a token without an exp claim', async () => {
    const token = await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.id)
      .sign(secretKey(getEnv().JWT_SECRET));
    const res = await request(createApp()).get(ME).set('Cookie', tokenCookie(token));

    expect(res.status).toBe(401);
  });

  it('returns 401 for a valid token whose user no longer exists', async () => {
    const ghost = await createTestUser({
      name: 'Ghost',
      email: 'ghost@test.local',
      role: 'ADMIN',
      password: 'Ghost@12345',
    });
    const app = createApp();
    const cookie = await loginCookie(app, ghost);
    await prisma.user.delete({ where: { id: ghost.id } });

    const res = await request(app).get(ME).set('Cookie', cookie);
    expect(res.status).toBe(401);

    const unknownSub = await signAccessToken(
      { sub: 'cnonexistentuser0000000000', role: 'ADMIN' },
      getEnv().JWT_SECRET,
      3600,
    );
    const res2 = await request(app).get(ME).set('Cookie', tokenCookie(unknownSub));
    expect(res2.status).toBe(401);
  });

  it('uses the role from the database, not from the token', async () => {
    // A correctly signed token that claims ADMIN for an employee account.
    const token = await signAccessToken(
      { sub: employee.id, role: 'ADMIN' },
      getEnv().JWT_SECRET,
      3600,
    );
    const res = await request(createApp()).get(ME).set('Cookie', tokenCookie(token));

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('EMPLOYEE');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('returns 204 and clears the cookie with matching attributes', async () => {
    const app = createApp();
    const cookie = await loginCookie(app, employee);
    const res = await request(app).post(LOGOUT).set('Cookie', cookie);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const cleared = authSetCookie(res);
    expect(cleared).toMatch(new RegExp(`^${AUTH_COOKIE}=;`));
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
    expect(cleared).toMatch(/; HttpOnly/);
    expect(cleared).toMatch(/; SameSite=Lax/);
    expect(cleared).toMatch(/; Path=\//);
  });

  it('is idempotent without a cookie', async () => {
    const res = await request(createApp()).post(LOGOUT);

    expect(res.status).toBe(204);
  });
});
