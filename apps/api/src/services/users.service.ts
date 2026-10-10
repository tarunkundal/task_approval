import type { UserDto } from '@workspace/shared';
import { prisma } from '../lib/prisma.js';

/** Columns safe to return to clients. `passwordHash` is never selected. */
export const userDtoSelect = { id: true, name: true, email: true, role: true } as const;

export async function findUserById(id: string): Promise<UserDto | null> {
  return prisma.user.findUnique({ where: { id }, select: userDtoSelect });
}

/** Employee accounts for the admin's employee list and assignee picker. */
export async function listEmployees(): Promise<UserDto[]> {
  return prisma.user.findMany({
    where: { role: 'EMPLOYEE' },
    select: userDtoSelect,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}
