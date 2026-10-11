import { Router, type RequestHandler } from 'express';
import { summary } from '../controllers/dashboard.controller.js';

export function dashboardRouter(authenticate: RequestHandler): Router {
  const router = Router();

  router.use(authenticate);
  router.get('/summary', summary);

  return router;
}
