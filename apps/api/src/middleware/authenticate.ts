import type { UserDto } from '@workspace/shared';
import type { Request, RequestHandler } from 'express';
import { unauthenticated } from '../errors/app-error.js';
import { AUTH_COOKIE, clearAuthCookie, type AuthCookieConfig } from '../lib/auth-cookie.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { findUserById } from '../services/users.service.js';

/** The verified actor. Identity and role always come from the database, never the request. */
export type AuthUser = UserDto;

export interface AuthenticateConfig {
  jwtSecret: string;
  cookie: AuthCookieConfig;
}

/**
 * Requires a valid access-token cookie: HS256 signature and expiry are checked on every
 * request, then the user is reloaded by `sub`. Any failure → 401 and the cookie is cleared.
 */
export function createAuthenticate(config: AuthenticateConfig): RequestHandler {
  return async (req, res, next) => {
    const token: unknown = req.cookies?.[AUTH_COOKIE];
    if (typeof token !== 'string' || token === '') {
      next(unauthenticated());
      return;
    }

    const claims = await verifyAccessToken(token, config.jwtSecret);
    const user = claims ? await findUserById(claims.sub) : null;
    if (!user) {
      clearAuthCookie(res, config.cookie);
      next(unauthenticated('Session is invalid or has expired'));
      return;
    }

    req.user = user;
    next();
  };
}

/** Returns the authenticated user; use only behind `authenticate`. */
export function requireUser(req: Request): AuthUser {
  if (!req.user) throw unauthenticated();
  return req.user;
}
