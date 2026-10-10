import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';
import type { DatabaseCheck } from '../services/health.service.js';

export function healthRouter(checkDatabase: DatabaseCheck): Router {
  const router = Router();
  router.get('/', healthController(checkDatabase));
  return router;
}
