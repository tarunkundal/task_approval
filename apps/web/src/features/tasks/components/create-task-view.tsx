'use client';

import { isApiError } from '@/lib/api/errors';
import { apiErrorMessage } from '@/lib/form-errors';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCreateTask } from '../hooks/use-task-mutations';
import { ADMIN_TASKS_PATH, adminTaskHref } from '../lib/paths';
import { INLINE_FORM_CODES, TaskForm } from './task-form';

/** Codes the form shows inline (field / root errors, see `INLINE_FORM_CODES`) aren't toasted. */
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
