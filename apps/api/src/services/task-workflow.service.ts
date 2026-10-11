import type { TaskDto } from '@workspace/shared';
import { Role, TASK_TRANSITIONS, TaskAction } from '@workspace/shared';
import { AppError, ErrorCode, forbidden } from '../errors/app-error.js';
import { prisma } from '../lib/prisma.js';
import { findTaskInScope, taskInScopeWhere, type TaskActor } from './task-access.js';
import { getTask } from './tasks.service.js';

/**
 * The only place task status changes (ARCHITECTURE.md §5).
 *
 * Enforcement is the conditional update itself, not a read-then-check:
 *   UPDATE tasks SET status = <to> WHERE id = ? AND <actor scope> AND status = <from>
 * - Scope: employees match only tasks assigned to them; admins any non-deleted task.
 * - State: the row must still be in the `from` status, so of two conflicting concurrent
 *   transitions only the first matches a row; the second gets 409.
 * - Role: route-level `requireRole` gates every action (start/submit: EMPLOYEE, approve/reject:
 *   ADMIN). approve/reject also check ADMIN here, because the employee scope alone would match
 *   an assignee's own PENDING_APPROVAL task.
 * The status update and the history row are written in one transaction, so a failed history
 * insert rolls the status back.
 */

const ACTION_LABELS: Record<TaskAction, string> = {
  start: 'started',
  submit: 'submitted for approval',
  approve: 'approved',
  reject: 'rejected',
};

const invalidTransition = (action: TaskAction, current: string) =>
  new AppError(
    409,
    ErrorCode.INVALID_TRANSITION,
    `Task cannot be ${ACTION_LABELS[action]} while its status is ${current}`,
    { action, currentStatus: current },
  );

export async function transitionTask(
  actor: TaskActor,
  taskId: string,
  action: TaskAction,
  reason?: string,
): Promise<TaskDto> {
  const rule = TASK_TRANSITIONS[action];
  const isReview = action === TaskAction.APPROVE || action === TaskAction.REJECT;
  if (isReview && actor.role !== Role.ADMIN) throw forbidden();
  if (action === TaskAction.REJECT && !reason?.trim()) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'A rejection reason is required');
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const { count } = await tx.task.updateMany({
      where: { AND: [taskInScopeWhere(actor, taskId), { status: rule.from }] },
      data: {
        status: rule.to,
        ...(isReview ? { reviewedById: actor.id, reviewedAt: now } : {}),
      },
    });

    if (count === 0) {
      // Missing, deleted or outside the actor's scope → 404; otherwise the status was wrong.
      const current = await findTaskInScope(actor, taskId, tx);
      throw invalidTransition(action, current.status);
    }

    await tx.taskStatusHistory.create({
      data: {
        taskId,
        fromStatus: rule.from,
        toStatus: rule.to,
        actorId: actor.id,
        reason: action === TaskAction.REJECT ? (reason?.trim() ?? null) : null,
        createdAt: now,
      },
    });

    return getTask(actor, taskId, tx);
  });
}
