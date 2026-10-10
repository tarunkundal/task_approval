import { prisma } from '../../src/lib/prisma.js';
import { assertSafeTestDatabase } from './db-guard.js';

/**
 * Deletes all rows (children first, so foreign keys with RESTRICT are satisfied).
 * Re-checks the guard so it can never run against a non-test database.
 */
export async function resetDatabase(): Promise<void> {
  assertSafeTestDatabase(process.env);
  await prisma.$transaction([
    prisma.taskStatusHistory.deleteMany(),
    prisma.taskComment.deleteMany(),
    prisma.task.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
