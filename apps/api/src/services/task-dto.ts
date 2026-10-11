import type { TaskDto } from '@workspace/shared';
import { TaskStatus } from '@workspace/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { formatDateOnly } from '../lib/dates.js';

const taskUserSelect = { id: true, name: true, email: true } as const;

/** Newest first; `id` breaks ties between rows written in the same millisecond. */
const latestHistoryFirst: Prisma.TaskStatusHistoryOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

/**
 * Relations loaded with every task. `passwordHash` and `deletedAt` are never exposed: users are
 * narrowed by `select`, and `toTaskDto` builds the response field by field.
 */
export const taskDtoInclude = {
  assignedTo: { select: taskUserSelect },
  createdBy: { select: taskUserSelect },
  reviewedBy: { select: { id: true, name: true } },
  // Latest history row only, to derive `latestRejectionReason`.
  history: {
    select: { fromStatus: true, toStatus: true, reason: true },
    orderBy: latestHistoryFirst,
    take: 1,
  },
} as const satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskDtoInclude }>;

/** A rejection is PENDING_APPROVAL → IN_PROGRESS (the only transition with that pair). */
function latestRejectionReason(task: TaskWithRelations): string | null {
  const latest = task.history[0];
  const isRejection =
    latest?.fromStatus === TaskStatus.PENDING_APPROVAL &&
    latest.toStatus === TaskStatus.IN_PROGRESS;
  return isRejection && task.status === TaskStatus.IN_PROGRESS ? (latest.reason ?? null) : null;
}

export function toTaskDto(task: TaskWithRelations): TaskDto {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    dueDate: formatDateOnly(task.dueDate),
    assignedTo: task.assignedTo,
    createdBy: task.createdBy,
    reviewedBy: task.reviewedBy,
    reviewedAt: task.reviewedAt?.toISOString() ?? null,
    latestRejectionReason: latestRejectionReason(task),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
