import type { CreateUserInput } from '@workspace/shared';
import type { RequestHandler } from 'express';
import { createEmployee, listEmployees } from '../services/users.service.js';

/** GET /users — admin only; employee accounts as safe DTOs. */
export const listUsers: RequestHandler = async (_req, res) => {
  res.status(200).json({ data: await listEmployees() });
};

/** POST /users — admin only; body validated by `createUserSchema`. Always creates an EMPLOYEE. */
export const createUser: RequestHandler = async (req, res) => {
  res.status(201).json(await createEmployee(req.body as CreateUserInput));
};
