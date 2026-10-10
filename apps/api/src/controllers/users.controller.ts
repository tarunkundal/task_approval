import type { RequestHandler } from 'express';
import { listEmployees } from '../services/users.service.js';

/** GET /users — admin only; employee accounts as safe DTOs. */
export const listUsers: RequestHandler = async (_req, res) => {
  res.status(200).json({ data: await listEmployees() });
};
