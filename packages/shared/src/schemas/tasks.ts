import { z } from 'zod';
import { PRIORITIES, TASK_STATUSES } from '../enums.js';
import { dateOnlySchema, idSchema } from './common.js';

const titleSchema = z.string().trim().min(1, 'Title is required').max(200);
const descriptionSchema = z.string().trim().max(5000);

/** Status always starts as PENDING; it is never accepted from the client. */
export const createTaskSchema = z.strictObject({
  title: titleSchema,
  description: descriptionSchema.default(''),
  priority: z.enum(PRIORITIES),
  dueDate: dateOnlySchema,
  assignedToId: idSchema,
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/**
 * Strict whitelist: `status`, `createdById`, `reviewedById`, `reviewedAt`, `deletedAt` (or any
 * other key) are rejected, so status can only change through the workflow endpoints.
 * Defined without defaults so a missing field is never filled in.
 */
export const updateTaskSchema = z
  .strictObject({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    priority: z.enum(PRIORITIES).optional(),
    dueDate: dateOnlySchema.optional(),
    assignedToId: idSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const rejectTaskSchema = z.strictObject({
  reason: z.string().trim().min(1, 'A rejection reason is required').max(1000),
});
export type RejectTaskInput = z.infer<typeof rejectTaskSchema>;

/** start / submit / approve take no body; an empty JSON object is accepted. */
export const emptyBodySchema = z.strictObject({}).optional();

export const TASK_SORT_FIELDS = ['createdAt', 'updatedAt', 'dueDate', 'priority'] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const MAX_PAGE_SIZE = 100;

export const taskListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  /** Admin filter. For employees the scope still forces their own id. */
  assignedToId: idSchema.optional(),
  /** Title search (case-insensitive through the MySQL collation). Blank means no search. */
  q: z.string().trim().max(100).optional(),
  sort: z.enum(TASK_SORT_FIELDS).default('createdAt'),
  order: z.enum(SORT_ORDERS).default('desc'),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
