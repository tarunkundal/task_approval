import type { Role } from '@workspace/shared';
import type { RequestHandler } from 'express';
import { forbidden, unauthenticated } from '../errors/app-error.js';

/** Allows only the given roles (403 otherwise). Must run after `authenticate`. */
export function requireRole(...roles: [Role, ...Role[]]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(unauthenticated());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}
