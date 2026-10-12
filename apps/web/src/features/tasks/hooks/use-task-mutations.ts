import { isApiError, type ApiError } from '@/lib/api/errors';
import { apiErrorMessage } from '@/lib/form-errors';
import {
  afterTaskCreated,
  afterTaskDeleted,
  afterTaskTransition,
  afterTaskUpdated,
  refreshStaleTask,
  STALE_TASK_CODES,
} from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  CommentDto,
  CreateCommentInput,
  CreateTaskInput,
  TaskDto,
  UpdateTaskInput,
} from '@workspace/shared';
import { toast } from 'sonner';
import {
  addComment,
  createTask,
  deleteTask,
  rejectTask,
  runTaskAction,
  updateTask,
  type BodylessTaskAction,
} from '../api/tasks-api';

/** Success toasts per workflow action. */
export const ACTION_SUCCESS_MESSAGE = {
  start: 'Task started',
  submit: 'Submitted for approval',
  approve: 'Task approved',
  reject: 'Task returned to the employee',
} as const;

/** 409 INVALID_TRANSITION / TASK_COMPLETED / CONFLICT or 404: the view of the task is stale. */
export function isStaleTaskError(error: unknown): boolean {
  return isApiError(error) && STALE_TASK_CODES.has(error.code);
}

/** Toasts the API message; when the task changed underneath the user, refetches it. */
export function reportTaskError(
  queryClient: QueryClient,
  taskId: string,
  error: unknown,
  fallback: string,
): void {
  toast.error(apiErrorMessage(error, fallback));
  if (isStaleTaskError(error)) void refreshStaleTask(queryClient, taskId);
}

/** start / submit / approve. Errors are toasted here (409 → refetch). */
export function useTaskTransition() {
  const queryClient = useQueryClient();
  return useMutation<TaskDto, ApiError, { id: string; action: BodylessTaskAction }>({
    mutationFn: ({ id, action }) => runTaskAction(id, action),
    onSuccess: (task, { action }) => {
      toast.success(ACTION_SUCCESS_MESSAGE[action]);
      return afterTaskTransition(queryClient, task);
    },
    onError: (error, { id }) => {
      reportTaskError(queryClient, id, error, 'Could not update the task.');
    },
  });
}

/**
 * Reject with a reason. The dialog handles errors (validation inline, the rest toasted).
 * The refetches aren't awaited so the dialog closes right away (in the approval queue the row,
 * and with it the dialog, disappears once the list refetches).
 */
export function useRejectTask() {
  const queryClient = useQueryClient();
  return useMutation<TaskDto, ApiError, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) => rejectTask(id, reason),
    onSuccess: (task) => {
      toast.success(ACTION_SUCCESS_MESSAGE.reject);
      void afterTaskTransition(queryClient, task);
    },
  });
}

/** The form handles errors (field errors inline, the rest toasted). */
export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation<TaskDto, ApiError, CreateTaskInput>({
    mutationFn: createTask,
    onSuccess: (task) => {
      toast.success('Task created');
      // The form navigates to the new task's detail page; seed it to skip a refetch.
      queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
      return afterTaskCreated(queryClient);
    },
  });
}

/** The form handles errors (field errors inline, the rest toasted). */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation<TaskDto, ApiError, { id: string; patch: UpdateTaskInput }>({
    mutationFn: ({ id, patch }) => updateTask(id, patch),
    onSuccess: (task) => {
      toast.success('Task updated');
      return afterTaskUpdated(queryClient, task);
    },
  });
}

/**
 * Soft delete. `onDeleted` runs before the cache is cleaned up, so a detail page can navigate
 * away before its query is removed. Errors are toasted here (404 → refetch).
 */
export function useDeleteTask(options: { onDeleted?: (id: string) => void } = {}) {
  const queryClient = useQueryClient();
  const { onDeleted } = options;
  return useMutation<void, ApiError, string>({
    mutationFn: deleteTask,
    onSuccess: (_data, id) => {
      toast.success('Task deleted');
      onDeleted?.(id);
      return afterTaskDeleted(queryClient, id);
    },
    onError: (error, id) => {
      reportTaskError(queryClient, id, error, 'Could not delete the task.');
    },
  });
}

/** The form handles errors (validation inline, the rest toasted). */
export function useAddComment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation<CommentDto, ApiError, CreateCommentInput>({
    mutationFn: (input) => addComment(taskId, input),
    onSuccess: () => {
      toast.success('Comment added');
      return queryClient.invalidateQueries({ queryKey: queryKeys.tasks.comments(taskId) });
    },
  });
}
