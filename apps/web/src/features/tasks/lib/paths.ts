import { isApiError, type ApiError } from '@/lib/api/errors';

export const ADMIN_TASKS_PATH = '/admin/tasks';
export const ADMIN_NEW_TASK_PATH = '/admin/tasks/new';

export function adminTaskHref(id: string): string {
  return `${ADMIN_TASKS_PATH}/${encodeURIComponent(id)}`;
}

export function adminTaskEditHref(id: string): string {
  return `${adminTaskHref(id)}/edit`;
}

/** Employee home: own counts + assigned task list. */
export const EMPLOYEE_HOME_PATH = '/employee';

export function employeeTaskHref(id: string): string {
  return `${EMPLOYEE_HOME_PATH}/tasks/${encodeURIComponent(id)}`;
}

/** 404 (missing, deleted, out of scope) and 400 (malformed id) both mean "Task not found". */
export function isTaskNotFoundError(error: unknown): error is ApiError {
  return (
    isApiError(error) &&
    (error.status === 404 || (error.status === 400 && error.code === 'VALIDATION_ERROR'))
  );
}
