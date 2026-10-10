import type { CookieOptions, Response } from 'express';

/** Name of the httpOnly cookie that carries the access token. */
export const AUTH_COOKIE = 'tas_token';

export interface AuthCookieConfig {
  /** Secure flag; true when NODE_ENV=production. */
  secure: boolean;
  /** Lifetime in seconds; matches the JWT `exp`. */
  maxAgeSeconds: number;
}

/**
 * SameSite=Lax is deliberate: the browser only talks to the Next.js origin, which proxies
 * /api/v1 to Express (ARCHITECTURE.md D1), so the cookie is first-party.
 */
function baseOptions(config: AuthCookieConfig): CookieOptions {
  return { httpOnly: true, secure: config.secure, sameSite: 'lax', path: '/' };
}

export function setAuthCookie(res: Response, token: string, config: AuthCookieConfig): void {
  res.cookie(AUTH_COOKIE, token, { ...baseOptions(config), maxAge: config.maxAgeSeconds * 1000 });
}

/** Clears the cookie with the same attributes it was set with (Express sets an epoch Expires). */
export function clearAuthCookie(res: Response, config: AuthCookieConfig): void {
  res.clearCookie(AUTH_COOKIE, baseOptions(config));
}
