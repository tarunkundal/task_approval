import type { CommentDto, CreateCommentInput, TaskHistoryDto } from '@workspace/shared';
import { prisma } from '../lib/prisma.js';
import { findTaskInScope, type TaskActor } from './task-access.js';

/**
 * Comments and status history of a task. The task is always loaded through the actor's scope
 * first, so another employee's or a deleted task gives 404. Neither has edit or delete paths.
 */

/** Author / actor fields safe to show to any task viewer (no email, no password hash). */
const actorSelect = { id: true, name: true, role: true } as const;

/** Chronological; `id` breaks ties between rows written in the same millisecond. */
const oldestFirst = () => [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

export async function listComments(actor: TaskActor, taskId: string): Promise<CommentDto[]> {
  await findTaskInScope(actor, taskId);
  const comments = await prisma.taskComment.findMany({
    where: { taskId },
    select: { id: true, body: true, createdAt: true, author: { select: actorSelect } },
    orderBy: oldestFirst(),
  });
  return comments.map((comment) => ({ ...comment, createdAt: comment.createdAt.toISOString() }));
}

export async function addComment(
  actor: TaskActor,
  taskId: string,
  input: CreateCommentInput,
): Promise<CommentDto> {
  return prisma.$transaction(async (tx) => {
    await findTaskInScope(actor, taskId, tx);
    const comment = await tx.taskComment.create({
      data: { taskId, authorId: actor.id, body: input.body },
      select: { id: true, body: true, createdAt: true, author: { select: actorSelect } },
    });
    return { ...comment, createdAt: comment.createdAt.toISOString() };
  });
}

export async function listHistory(actor: TaskActor, taskId: string): Promise<TaskHistoryDto[]> {
  await findTaskInScope(actor, taskId);
  const rows = await prisma.taskStatusHistory.findMany({
    where: { taskId },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      reason: true,
      createdAt: true,
      actor: { select: actorSelect },
    },
    orderBy: oldestFirst(),
  });
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
