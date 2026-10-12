'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api/errors';
import { apiErrorMessage } from '@/lib/form-errors';
import { useCreateTask } from '../hooks/use-task-mutations';
import { ADMIN_TASKS_PATH, adminTaskHref } from '../lib/paths';
import { TaskForm } from './task-form';

/** Codes the form shows inline (field / root errors); anything else is toasted. */
export const INLINE_FORM_CODES: ReadonlySet<string> = new Set([
  'VALIDATION_ERROR',
  'INVALID_ASSIGNEE',
]);

export function toastUnlessInline(error: unknown, fallback: string): void {
  if (isApiError(error) && INLINE_FORM_CODES.has(error.code)) return;
  toast.error(apiErrorMessage(error, fallback));
}

export function CreateTaskView() {
  const router = useRouter();
  const createMutation = useCreateTask();

  return (
    <TaskForm
      mode="create"
      cancelHref={ADMIN_TASKS_PATH}
      pending={createMutation.isPending || createMutation.isSuccess}
      onSubmit={async (values) => {
        try {
          const task = await createMutation.mutateAsync(values);
          router.push(adminTaskHref(task.id));
        } catch (error) {
          toastUnlessInline(error, 'Could not create the task.');
          throw error;
        }
      }}
    />
  );
}
