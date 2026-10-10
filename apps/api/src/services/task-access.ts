import type { UserDto } from '@workspace/shared';
import { Role } from '@workspace/shared';
import { notFound } from '../errors/app-error.js';
import type { Prisma, Task } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

/**
 * Central task ownership policy. Every task endpoint must load tasks through these helpers so
 * the scope is applied in the database query itself, never by filtering results afterwards.
 */

/** The verified actor (from `req.user`), never ids or roles taken from the request. */
export type TaskActor = Pick<UserDto, 'id' | 'role'>;

/** Tasks the actor may see: admins see all non-deleted tasks, employees only their own. */
export function visibleTasksWhere(actor: TaskActor): Prisma.TaskWhereInput {
  return actor.role === Role.ADMIN
    ? { deletedAt: null }
    : { deletedAt: null, assignedToId: actor.id };
}

/** A single task by id, restricted to the actor's scope. */
export function taskInScopeWhere(actor: TaskActor, id: string): Prisma.TaskWhereInput {
  return { ...visibleTasksWhere(actor), id };
}

type TaskReader = Pick<Prisma.TransactionClient, 'task'>;

/**
 * Loads a task within the actor's scope. Missing, soft-deleted and other employees' tasks all
 * produce the same 404, so the existence of an inaccessible task is not disclosed.
 */
export async function findTaskInScope(
  actor: TaskActor,
  id: string,
  db: TaskReader = prisma,
): Promise<Task> {
  const task = await db.task.findFirst({ where: taskInScopeWhere(actor, id) });
  if (!task) throw notFound('Task not found');
  return task;
}
