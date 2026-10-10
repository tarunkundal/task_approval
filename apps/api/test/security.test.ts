import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { allowedOrigin, createTestUser, type TestUser } from './helpers/auth.js';

const LOGIN = '/api/v1/auth/login';
const EVIL = 'https://evil.example';

let employee: TestUser;

beforeAll(async () => {
  employee = await createTestUser({
    name: 'Security Employee',
    email: 'security@test.local',
    role: 'EMPLOYEE',
    password: 'Employee@12345',
  });
});

const credentials = () => ({ email: employee.email, password: employee.password });

describe('CSRF protection on unsafe methods', () => {
  it('rejects a login from a foreign Origin with 403', async () => {
    const res = await request(createApp()).post(LOGIN).set('Origin', EVIL).send(credentials());

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'CSRF_REJECTED', message: 'Cross-site request rejected' },
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('allows a login from an allowed Origin', async () => {
    const res = await request(createApp())
      .post(LOGIN)
      .set('Origin', allowedOrigin())
      .set('Sec-Fetch-Site', 'same-origin')
      .send(credentials());

    expect(res.status).toBe(200);
  });

  it('rejects Sec-Fetch-Site: cross-site when Origin is absent', async () => {
    const res = await request(createApp())
      .post(LOGIN)
      .set('Sec-Fetch-Site', 'cross-site')
      .send(credentials());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });

  it('rejects Sec-Fetch-Site: same-site when Origin is absent', async () => {
    const res = await request(createApp())
      .post(LOGIN)
      .set('Sec-Fetch-Site', 'same-site')
      .send(credentials());

    expect(res.status).toBe(403);
  });

  it('rejects the opaque Origin "null"', async () => {
    const res = await request(createApp()).post(LOGIN).set('Origin', 'null').send(credentials());

    expect(res.status).toBe(403);
  });

  it('applies to logout as well', async () => {
    const res = await request(createApp()).post('/api/v1/auth/logout').set('Origin', EVIL);

    expect(res.status).toBe(403);
  });

  it('does not apply to safe methods', async () => {
    const res = await request(createApp()).get('/health').set('Origin', EVIL);

    expect(res.status).toBe(200);
  });

  it('rejects a non-JSON body with 415 (form and text/plain posts)', async () => {
    const app = createApp();
    const form = await request(app)
      .post(LOGIN)
      .type('form')
      .send(`email=${employee.email}&password=${employee.password}`);
    const text = await request(app)
      .post(LOGIN)
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify(credentials()));

    expect(form.status).toBe(415);
    expect(form.body).toEqual({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Request body must be sent as application/json',
      },
    });
    expect(text.status).toBe(415);
  });
});

describe('CORS', () => {
  it('allows credentialed requests from the configured origin', async () => {
    const res = await request(createApp())
      .options(LOGIN)
      .set('Origin', allowedOrigin())
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin());
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('sends no Access-Control-Allow-Origin to other origins', async () => {
    const res = await request(createApp())
      .options(LOGIN)
      .set('Origin', EVIL)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('returns 429 RATE_LIMITED after the configured number of login attempts', async () => {
    const app = createApp({ rateLimits: { login: { limit: 3, windowMs: 60_000 } } });
    const attempt = () =>
      request(app).post(LOGIN).send({ email: employee.email, password: 'wrong-password' });

    for (let i = 0; i < 3; i += 1) {
      expect((await attempt()).status).toBe(401);
    }
    const limited = await attempt();

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many login attempts, please try again later' },
    });
    // Even the correct password is refused until the window resets.
    const correct = await request(app).post(LOGIN).send(credentials());
    expect(correct.status).toBe(429);
  });

  it('keys login attempts by email, so another account is not locked out', async () => {
    const app = createApp({ rateLimits: { login: { limit: 1, windowMs: 60_000 } } });
    await request(app).post(LOGIN).send({ email: 'other@test.local', password: 'x' });
    expect(
      (await request(app).post(LOGIN).send({ email: 'other@test.local', password: 'x' })).status,
    ).toBe(429);

    const res = await request(app).post(LOGIN).send(credentials());
    expect(res.status).toBe(200);
  });

  it('limits state-changing requests in general', async () => {
    const app = createApp({ rateLimits: { write: { limit: 2, windowMs: 60_000 } } });
    await request(app).post('/api/v1/auth/logout');
    await request(app).post('/api/v1/auth/logout');
    const res = await request(app).post('/api/v1/auth/logout');

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    // Reads are not counted by the write limiter.
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });
});

describe('request body limits', () => {
  it('rejects a JSON body over 100kb with 413', async () => {
    const res = await request(createApp())
      .post(LOGIN)
      .send({ email: employee.email, password: 'x'.repeat(110 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
    });
  });
});
