import { z } from 'zod';
import { emailSchema } from './common.js';

/**
 * Admin creates an EMPLOYEE account. There is deliberately no `role` field:
 * the strict object rejects it, and the API always sets role = EMPLOYEE.
 */
export const createUserSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: emailSchema,
  // bcrypt only uses the first 72 bytes of a password.
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
