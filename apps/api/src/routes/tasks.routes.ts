import {
  createCommentSchema,
  createTaskSchema,
  emptyBodySchema,
  idParamSchema,
  rejectTaskSchema,
  Role,
  taskListQuerySchema,
  updateTaskSchema,
} from '@workspace/shared';
import { Router, type RequestHandler } from 'express';
import * as tasks from '../controllers/tasks.controller.js';
import { requireRole } from '../middleware/require-role.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';

/**
 * Check order on every route: authenticate (401) → role (403) → params / query / body (400)
 * → task scope (404, in the service) → state rules (409, in the service).
 */
export function tasksRouter(authenticate: RequestHandler): Router {
  const router = Router();
  const admin = requireRole(Role.ADMIN);
  const employee = requireRole(Role.EMPLOYEE);
  const id = validateParams(idParamSchema);
  const noBody = validateBody(emptyBodySchema);

  router.use(authenticate);

  router.get('/', validateQuery(taskListQuerySchema), tasks.list);
  router.post('/', admin, validateBody(createTaskSchema), tasks.create);
  router.get('/:id', id, tasks.get);
  router.patch('/:id', admin, id, validateBody(updateTaskSchema), tasks.update);
  router.delete('/:id', admin, id, tasks.remove);

  router.post('/:id/start', employee, id, noBody, tasks.transition('start'));
  router.post('/:id/submit', employee, id, noBody, tasks.transition('submit'));
  router.post('/:id/approve', admin, id, noBody, tasks.transition('approve'));
  router.post('/:id/reject', admin, id, validateBody(rejectTaskSchema), tasks.reject);

  router.get('/:id/comments', id, tasks.comments);
  router.post('/:id/comments', id, validateBody(createCommentSchema), tasks.comment);
  router.get('/:id/history', id, tasks.history);

  return router;
}
