import type { LoginInput, UserDto } from '@workspace/shared';
import { AppError, ErrorCode } from '../errors/app-error.js';
import { verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';

/** One message for unknown email and wrong password, so accounts cannot be enumerated. */
const invalidCredentials = () =>
  new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');

/** Checks credentials and returns the safe user DTO. `input.email` is already normalized. */
export async function verifyCredentials(input: LoginInput): Promise<UserDto> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, name: true, email: true, role: true, passwordHash: true },
  });
  // Always run bcrypt (against a dummy hash when the user is missing) to equalize timing.
  const valid = await verifyPassword(input.password, user?.passwordHash);
  if (!user || !valid) throw invalidCredentials();

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
