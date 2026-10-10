import { z } from 'zod';
import { PRIORITIES, TASK_STATUSES } from '../enums.js';
import { dateOnlySchema, idSchema } from './common.js';

const taskFields = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(5000),
  priority: z.enum(PRIORITIES),
  dueDate: dateOnlySchema,
  assignedToId: idSchema,
};

/** Status always starts as PENDING; it is never accepted from the client. */
export const createTaskSchema = z.strictObject(taskFields);
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Strict whitelist: `status`, `createdById`, `reviewedById`, `reviewedAt` (or any other key)
 * are rejected, so status can only change through the workflow endpoints.
 */
export const updateTaskSchema = z
  .strictObject(taskFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const rejectTaskSchema = z.strictObject({
  reason: z.string().trim().min(1, 'A rejection reason is required').max(1000),
});
export type RejectTaskInput = z.infer<typeof rejectTaskSchema>;

export const TASK_SORTS = [
  '-createdAt',
  'createdAt',
  'dueDate',
  '-dueDate',
  'priority',
  '-priority',
] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export const taskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedToId: idSchema.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(TASK_SORTS).default('-createdAt'),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
