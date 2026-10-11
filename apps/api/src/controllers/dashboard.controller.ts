import type { RequestHandler } from 'express';
import { requireUser } from '../middleware/authenticate.js';
import { getDashboardSummary } from '../services/dashboard.service.js';

/** GET /dashboard/summary — counts within the caller's task scope. */
export const summary: RequestHandler = async (req, res) => {
  res.status(200).json(await getDashboardSummary(requireUser(req)));
};
