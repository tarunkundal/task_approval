/**
 * Compile-time check that the shared enums match the Prisma enums exactly (values and keys).
 * Not a runtime test: `pnpm --filter api typecheck` fails if either side drifts.
 */
import type { Priority, Role, TaskStatus } from '@workspace/shared';
import type { $Enums } from '../src/generated/prisma/client.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

export type EnumParity = [
  Assert<Equal<Role, $Enums.Role>>,
  Assert<Equal<TaskStatus, $Enums.TaskStatus>>,
  Assert<Equal<Priority, $Enums.Priority>>,
  // The const objects too (same keys mapped to the same values).
  Assert<Equal<typeof Role, typeof $Enums.Role>>,
  Assert<Equal<typeof TaskStatus, typeof $Enums.TaskStatus>>,
  Assert<Equal<typeof Priority, typeof $Enums.Priority>>,
];
