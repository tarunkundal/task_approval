import { z } from 'zod';
import { emailSchema } from './common.js';

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;
