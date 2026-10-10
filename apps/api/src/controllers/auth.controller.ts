import type { LoginInput } from '@workspace/shared';
import type { RequestHandler } from 'express';
import { clearAuthCookie, setAuthCookie, type AuthCookieConfig } from '../lib/auth-cookie.js';
import { signAccessToken } from '../lib/jwt.js';
import { requireUser } from '../middleware/authenticate.js';
import { verifyCredentials } from '../services/auth.service.js';

export interface AuthControllerConfig {
  jwtSecret: string;
  cookie: AuthCookieConfig;
}

export interface AuthController {
  login: RequestHandler;
  logout: RequestHandler;
  me: RequestHandler;
}

export function authController(config: AuthControllerConfig): AuthController {
  /** POST /auth/login — body already validated by `loginSchema`. Token goes in the cookie only. */
  const login: RequestHandler = async (req, res) => {
    const user = await verifyCredentials(req.body as LoginInput);
    const token = await signAccessToken(
      { sub: user.id, role: user.role },
      config.jwtSecret,
      config.cookie.maxAgeSeconds,
    );
    setAuthCookie(res, token, config.cookie);
    res.set('Cache-Control', 'no-store').status(200).json(user);
  };

  /** POST /auth/logout — idempotent; always 204. */
  const logout: RequestHandler = (_req, res) => {
    clearAuthCookie(res, config.cookie);
    res.status(204).end();
  };

  /** GET /auth/me — the user loaded from the database by `authenticate`. */
  const me: RequestHandler = (req, res) => {
    res.set('Cache-Control', 'no-store').status(200).json(requireUser(req));
  };

  return { login, logout, me };
}
