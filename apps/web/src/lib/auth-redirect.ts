import { isLoginPath, loginPath } from '@/lib/routes';

/** Name of the httpOnly session cookie set by the API (`apps/api/src/lib/auth-cookie.ts`). */
export const AUTH_COOKIE = 'tas_token';

/**
 * Request header the proxy sets to the requested path + query, so server layouts can build a
 * `/login?next=` return path. Always overwritten by the proxy; only used through `safeReturnPath`.
 */
export const PATHNAME_HEADER = 'x-pathname';

export type ProxyDecision = { type: 'next' } | { type: 'redirect'; location: string };

/**
 * Fast pre-check for `src/proxy.ts`: only the cookie's presence is checked (the API stays the
 * authority; `(app)/layout.tsx` validates the session with `GET /auth/me`).
 * `/login` is never redirected here, so a stale cookie can't cause a redirect loop.
 */
export function proxyDecision(input: {
  pathname: string;
  search: string;
  hasToken: boolean;
}): ProxyDecision {
  if (isLoginPath(input.pathname) || input.hasToken) return { type: 'next' };
  return { type: 'redirect', location: loginPath(`${input.pathname}${input.search}`) };
}
