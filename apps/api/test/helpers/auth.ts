import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import request from 'supertest';
import type { Role } from '@workspace/shared';
import { getEnv } from '../../src/config/env.js';
import { AUTH_COOKIE } from '../../src/lib/auth-cookie.js';
import { prisma } from '../../src/lib/prisma.js';

/** First allowed browser origin from .env.test (FRONTEND_URL). */
export const allowedOrigin = (): string => getEnv().FRONTEND_URL[0] as string;

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  password: string;
}

/** Inserts a user directly in the test DB. Low bcrypt cost keeps the suite fast. */
export async function createTestUser(input: Omit<TestUser, 'id'>): Promise<TestUser> {
  const { id } = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, 4),
    },
    select: { id: true },
  });
  return { id, ...input };
}

export function setCookieHeaders(res: request.Response): string[] {
  const header = res.headers['set-cookie'] as string[] | string | undefined;
  if (header === undefined) return [];
  return Array.isArray(header) ? header : [header];
}

/** The raw `Set-Cookie` line for the auth cookie, if any. */
export function authSetCookie(res: request.Response): string | undefined {
  return setCookieHeaders(res).find((line) => line.startsWith(`${AUTH_COOKIE}=`));
}

/** Logs in and returns a `Cookie` header value (`tas_token=...`). */
export async function loginCookie(app: Express, user: TestUser): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: user.password });
  const line = authSetCookie(res);
  if (res.status !== 200 || !line) throw new Error(`login failed for ${user.email}: ${res.status}`);
  return line.split(';')[0] as string;
}
