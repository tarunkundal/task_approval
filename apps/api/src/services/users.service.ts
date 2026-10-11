import type { CreateUserInput, UserDto } from '@workspace/shared';
import { Role } from '@workspace/shared';
import { AppError, ErrorCode } from '../errors/app-error.js';
import { hashPassword } from '../lib/password.js';
import { isPrismaErrorCode } from '../lib/prisma-errors.js';
import { prisma } from '../lib/prisma.js';

/** Columns safe to return to clients. `passwordHash` is never selected. */
export const userDtoSelect = { id: true, name: true, email: true, role: true } as const;

export async function findUserById(id: string): Promise<UserDto | null> {
  return prisma.user.findUnique({ where: { id }, select: userDtoSelect });
}

/** Employee accounts for the admin's employee list and assignee picker. */
export async function listEmployees(): Promise<UserDto[]> {
  return prisma.user.findMany({
    where: { role: Role.EMPLOYEE },
    select: userDtoSelect,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

/**
 * Creates an EMPLOYEE account (admins only, enforced by the route). The role is fixed here and
 * never read from the request. The unique email index decides duplicates, so concurrent
 * requests for one address cannot both succeed.
 */
export async function createEmployee(input: CreateUserInput): Promise<UserDto> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.user.create({
      data: { name: input.name, email: input.email, role: Role.EMPLOYEE, passwordHash },
      select: userDtoSelect,
    });
  } catch (error) {
    if (isPrismaErrorCode(error, 'P2002')) {
      throw new AppError(409, ErrorCode.EMAIL_TAKEN, 'A user with this email already exists');
    }
    throw error;
  }
}
