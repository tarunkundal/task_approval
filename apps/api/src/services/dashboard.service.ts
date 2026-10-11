import type { DashboardSummaryDto } from '@workspace/shared';
import { TASK_STATUSES, TaskStatus } from '@workspace/shared';
import { todayUtc } from '../lib/dates.js';
import { prisma } from '../lib/prisma.js';
import { visibleTasksWhere, type TaskActor } from './task-access.js';

/**
 * Status counts within the actor's scope (admin: all non-deleted tasks; employee: own tasks),
 * computed with aggregate queries so they never depend on list pagination.
 * `overdue` uses today's UTC date; the UI may recompute it against the viewer's local date.
 */
export async function getDashboardSummary(actor: TaskActor): Promise<DashboardSummaryDto> {
  const scope = visibleTasksWhere(actor);

  const [groups, overdue] = await prisma.$transaction([
    prisma.task.groupBy({
      by: ['status'],
      where: scope,
      _count: { _all: true },
      orderBy: { status: 'asc' },
    }),
    prisma.task.count({
      where: {
        AND: [scope, { dueDate: { lt: todayUtc() } }, { status: { not: TaskStatus.COMPLETED } }],
      },
    }),
  ]);

  const byStatus = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<
    TaskStatus,
    number
  >;
  for (const group of groups) {
    byStatus[group.status] = group._count._all;
  }
  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

  return { total, byStatus, overdue };
}
