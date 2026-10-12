import 'server-only';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { Role, UserDto } from '@workspace/shared';
import { AUTH_COOKIE, PATHNAME_HEADER } from '@/lib/auth-redirect';
import { homeFor, loginPath } from '@/lib/routes';

/**
 * Server-only API access for layouts and route guards. `server-only` makes importing this
 * module from a client component a build error, so `API_URL` never reaches the browser bundle.
 */

/** Same resolution rules as `next.config.ts`: required in production, dev fallback only. */
export function getApiBaseUrl(): string {
  const value = process.env.API_URL?.trim();
  if (value) {
    const url = new URL(value);
    return url.origin + url.pathname.replace(/\/+$/, '');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('API_URL must be set in production.');
  }
  return 'http://localhost:4000';
}

/**
 * The signed-in user per `GET /auth/me`, or `null` when there is no valid session (401).
 * Forwards only the `tas_token` cookie. Cached per request, so the `(app)` layout and the section
 * layouts share one call. Other failures (API down, 5xx) throw and reach the error boundary.
 */
export const getCurrentUser = cache(async (): Promise<UserDto | null> => {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return null;

  const response = await fetch(`${getApiBaseUrl()}/api/v1/auth/me`, {
    headers: { Accept: 'application/json', Cookie: `${AUTH_COOKIE}=${encodeURIComponent(token)}` },
    cache: 'no-store',
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`GET /auth/me failed with HTTP ${response.status}`);
  }
  return (await response.json()) as UserDto;
});

/** The requested path + query, as forwarded by `src/proxy.ts`. */
async function requestedPath(): Promise<string | null> {
  return (await headers()).get(PATHNAME_HEADER);
}

/** The signed-in user; redirects to `/login?next=<current path>` without a valid session. */
export async function requireUser(): Promise<UserDto> {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath(await requestedPath()));
  return user;
}

/** The signed-in user with `role`; any other role is sent to its own home. */
export async function requireRole(role: Role): Promise<UserDto> {
  const user = await requireUser();
  if (user.role !== role) redirect(homeFor(user.role));
  return user;
}
