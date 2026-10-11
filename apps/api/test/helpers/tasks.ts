import type { Priority, TaskStatus } from '@workspace/shared';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { parseDateOnly } from '../../src/lib/dates.js';
import { prisma } from '../../src/lib/prisma.js';

const MINUTE = 60_000;

/**
 * App for task suites: generous limits so many requests in one file never hit 429.
 * Rate limiting itself is covered in security.test.ts.
 */
export function createTestApp(): Express {
  const rule = { limit: 100_000, windowMs: MINUTE };
  return createApp({ rateLimits: { write: rule, login: rule, loginIp: rule } });
}

export interface TaskRowInput {
  assignedToId: string;
  createdById: string;
  title?: string;
  status?: TaskStatus;
  priority?: Priority;
  dueDate?: string;
  description?: string;
  deletedAt?: Date | null;
}

/** Inserts a task directly (with its creation history row) to set up a given state. */
export async function createTaskRow(input: TaskRowInput): Promise<string> {
  const task = await prisma.task.create({
    data: {
      title: input.title ?? 'Fixture task',
      description: input.description ?? '',
      priority: input.priority ?? 'MEDIUM',
      status: input.status ?? 'PENDING',
      dueDate: parseDateOnly(input.dueDate ?? '2030-01-15'),
      assignedToId: input.assignedToId,
      createdById: input.createdById,
      deletedAt: input.deletedAt ?? null,
      history: {
        create: { fromStatus: null, toStatus: 'PENDING', actorId: input.createdById },
      },
    },
    select: { id: true },
  });
  return task.id;
}

export async function taskStatus(id: string): Promise<TaskStatus | undefined> {
  const task = await prisma.task.findUnique({ where: { id }, select: { status: true } });
  return task?.status;
}

export async function historyRows(taskId: string) {
  return prisma.taskStatusHistory.findMany({
    where: { taskId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { fromStatus: true, toStatus: true, actorId: true, reason: true },
  });
}

/** A well-formed cuid that matches no row. */
export const UNKNOWN_ID = 'cnonexistenttask0000000000';
