import { z } from 'zod';
import { emailSchema } from './common.js';

/** bcrypt only uses the first 72 bytes of a password, so longer input would be truncated. */
export const PASSWORD_MAX_BYTES = 72;

/** UTF-8 byte length (no TextEncoder, so the package needs neither DOM nor Node typings). */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    // Lone surrogates count as 3 bytes, like their U+FFFD replacement when encoded.
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export const newPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((value) => utf8ByteLength(value) <= PASSWORD_MAX_BYTES, {
    message: `Password must be at most ${PASSWORD_MAX_BYTES} bytes`,
  });

/**
 * Admin creates an EMPLOYEE account. There is deliberately no `role` field:
 * the strict object rejects it, and the API always sets role = EMPLOYEE.
 */
export const createUserSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: emailSchema,
  password: newPasswordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;
