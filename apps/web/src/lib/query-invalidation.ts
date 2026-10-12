import { queryKeys } from '@/lib/query-keys';
import type { QueryClient } from '@tanstack/react-query';
import type { TaskDto } from '@workspace/shared';

/**
 * Cache effects shared by the task mutations (docs/phase5-plan.md P10). Each mutation hook
 * calls one of these in `onSuccess` / `onError` so the effects stay in one place.
 */

/** After a workflow transition or rejection: the server returned the updated task. */
export async function afterTaskTransition(queryClient: QueryClient, task: TaskDto): Promise<void> {
  queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.history(task.id) }),
  ]);
}

/** After creating a task. */
export async function afterTaskCreated(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary }),
  ]);
}

/**
 * After editing a task. Edits don't change status, but a `dueDate` change moves the
 * summary's `overdue` count, so the summary is refreshed too.
 */
export async function afterTaskUpdated(queryClient: QueryClient, task: TaskDto): Promise<void> {
  queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary }),
  ]);
}

/** After a soft delete: drop the detail (and its comments/history) and refresh lists + counts. */
export async function afterTaskDeleted(queryClient: QueryClient, id: string): Promise<void> {
  queryClient.removeQueries({ queryKey: queryKeys.tasks.detail(id) });
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary }),
  ]);
}

/**
 * The task changed underneath the user (409 INVALID_TRANSITION / TASK_COMPLETED, or 404):
 * refetch everything that may show it. The detail key prefix also covers comments and history.
 */
export async function refreshStaleTask(queryClient: QueryClient, id: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(id) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary }),
  ]);
}

/** Codes meaning "your view of this task is out of date". */
export const STALE_TASK_CODES: ReadonlySet<string> = new Set([
  'INVALID_TRANSITION',
  'TASK_COMPLETED',
  'NOT_FOUND',
  'CONFLICT',
]);
