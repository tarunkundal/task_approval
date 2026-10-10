import { Role } from '@workspace/shared';
import { Router, type RequestHandler } from 'express';
import { listUsers } from '../controllers/users.controller.js';
import { requireRole } from '../middleware/require-role.js';

export function usersRouter(authenticate: RequestHandler): Router {
  const router = Router();

  router.use(authenticate, requireRole(Role.ADMIN));
  router.get('/', listUsers);

  return router;
}
