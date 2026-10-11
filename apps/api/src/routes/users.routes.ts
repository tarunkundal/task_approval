import { createUserSchema, Role } from '@workspace/shared';
import { Router, type RequestHandler } from 'express';
import { createUser, listUsers } from '../controllers/users.controller.js';
import { requireRole } from '../middleware/require-role.js';
import { validateBody } from '../middleware/validate.js';

export function usersRouter(authenticate: RequestHandler): Router {
  const router = Router();

  router.use(authenticate, requireRole(Role.ADMIN));
  router.get('/', listUsers);
  router.post('/', validateBody(createUserSchema), createUser);

  return router;
}
