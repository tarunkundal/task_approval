import type {
  CreateTaskInput,
  PaginatedResponse,
  SortOrder,
  TaskDto,
  TaskListQuery,
  TaskSortField,
  UpdateTaskInput,
} from '@workspace/shared';
import { Role, TaskStatus } from '@workspace/shared';
import { AppError, ErrorCode, notFound } from '../errors/app-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { parseDateOnly } from '../lib/dates.js';
import { isPrismaErrorCode } from '../lib/prisma-errors.js';
import { prisma } from '../lib/prisma.js';
import {
  findTaskInScope,
  taskInScopeWhere,
  visibleTasksWhere,
  type TaskActor,
} from './task-access.js';
import { taskDtoInclude, toTaskDto } from './task-dto.js';

/**
 * Task CRUD. Every read and write is scoped through `task-access.ts`; status never changes here
 * (only `task-workflow.service.ts` performs transitions). Field edits are not written to the
 * status history (audit scope D4).
 */

type Db = Prisma.TransactionClient;

const invalidAssignee = () =>
  new AppError(400, ErrorCode.INVALID_ASSIGNEE, 'Assignee must be an existing employee');

const taskCompleted = () =>
  new AppError(409, ErrorCode.TASK_COMPLETED, 'A completed task can no longer be edited');

/** Tasks can only be assigned to existing EMPLOYEE accounts. */
async function assertAssignableEmployee(db: Db, userId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== Role.EMPLOYEE) throw invalidAssignee();
}

/** The task as a DTO, within the actor's scope (404 otherwise). */
export async function getTask(actor: TaskActor, id: string, db: Db = prisma): Promise<TaskDto> {
  const task = await db.task.findFirst({
    where: taskInScopeWhere(actor, id),
    include: taskDtoInclude,
  });
  if (!task) throw notFound('Task not found');
  return toTaskDto(task);
}

/** Creates a PENDING task and its initial history row (from = null) in one transaction. */
export async function createTask(actor: TaskActor, input: CreateTaskInput): Promise<TaskDto> {
  return prisma.$transaction(async (tx) => {
    await assertAssignableEmployee(tx, input.assignedToId);
    const { id } = await tx.task.create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: parseDateOnly(input.dueDate),
        status: TaskStatus.PENDING,
        assignedToId: input.assignedToId,
        createdById: actor.id,
      },
      select: { id: true },
    });
    await tx.taskStatusHistory.create({
      data: { taskId: id, fromStatus: null, toStatus: TaskStatus.PENDING, actorId: actor.id },
    });
    return getTask(actor, id, tx);
  });
}

const SORTS: Record<TaskSortField, (order: SortOrder) => Prisma.TaskOrderByWithRelationInput> = {
  createdAt: (order) => ({ createdAt: order }),
  updatedAt: (order) => ({ updatedAt: order }),
  dueDate: (order) => ({ dueDate: order }),
  // MySQL orders ENUM columns by declaration order: LOW < MEDIUM < HIGH.
  priority: (order) => ({ priority: order }),
};

/**
 * Prisma passes `contains` to MySQL as `LIKE '%value%'` without escaping, so `%` and `_` in the
 * search would act as wildcards. Escape them (and the escape character itself) to match literally.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * Paginated list. The actor's scope is always ANDed into the query, so an employee passing
 * another employee's `assignedToId` simply gets no rows.
 */
export async function listTasks(
  actor: TaskActor,
  query: TaskListQuery,
): Promise<PaginatedResponse<TaskDto>> {
  const q = query.q?.trim();
  const where: Prisma.TaskWhereInput = {
    AND: [
      visibleTasksWhere(actor),
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
        // Case-insensitive through the column collation (utf8mb4_unicode_ci).
        ...(q ? { title: { contains: escapeLike(q) } } : {}),
      },
    ],
  };

  const [total, rows] = await prisma.$transaction([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      include: taskDtoInclude,
      // `id` makes the order total, so pages never overlap or skip rows.
      orderBy: [SORTS[query.sort](query.order), { id: query.order }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    data: rows.map(toTaskDto),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

/**
 * Edits title, description, priority, due date or assignee. COMPLETED tasks are read-only (D5).
 * Reassignment keeps the current status.
 *
 * Like `transitionTask`, the conditional update is the transaction's first statement. Under
 * InnoDB REPEATABLE READ the first plain SELECT fixes the snapshot, while UPDATE evaluates its
 * WHERE against the latest committed row. Reading first would let a concurrent approve or delete
 * make the update match 0 rows while every later read still showed the old row (a 200 for a
 * dropped edit). Here, any read happens after the update, so it sees what the update saw.
 * Check order stays scope (404) → COMPLETED (409) → assignee (400); a failed assignee check
 * throws and rolls the update back.
 */
export async function updateTask(
  actor: TaskActor,
  id: string,
  input: UpdateTaskInput,
): Promise<TaskDto> {
  return prisma.$transaction(async (tx) => {
    let count: number;
    try {
      ({ count } = await tx.task.updateMany({
        where: { AND: [taskInScopeWhere(actor, id), { status: { not: TaskStatus.COMPLETED } }] },
        data: {
          title: input.title,
          description: input.description,
          priority: input.priority,
          dueDate: input.dueDate === undefined ? undefined : parseDateOnly(input.dueDate),
          assignedToId: input.assignedToId,
        },
      }));
    } catch (error) {
      // The assignedToId foreign key fails only when the row matched (in scope, not COMPLETED).
      if (input.assignedToId !== undefined && isPrismaErrorCode(error, 'P2003')) {
        throw invalidAssignee();
      }
      throw error;
    }

    if (count === 0) {
      const latest = await findTaskInScope(actor, id, tx); // missing, deleted or out of scope → 404
      if (latest.status === TaskStatus.COMPLETED) throw taskCompleted();
      // Unreachable while COMPLETED and soft delete are final; never report a dropped edit as 200.
      throw new AppError(409, ErrorCode.CONFLICT, 'The task changed; reload and try again');
    }

    if (input.assignedToId !== undefined) await assertAssignableEmployee(tx, input.assignedToId);
    return getTask(actor, id, tx);
  });
}

/** Soft delete. History and comments stay in the database for the audit trail. */
export async function deleteTask(actor: TaskActor, id: string): Promise<void> {
  const { count } = await prisma.task.updateMany({
    where: taskInScopeWhere(actor, id),
    data: { deletedAt: new Date() },
  });
  if (count === 0) throw notFound('Task not found');
}
