'use client';

import { useQueryClient } from '@tanstack/react-query';
import { TaskStatus } from '@workspace/shared';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorState } from '@/components/common/error-state';
import { LoadingSkeleton } from '@/components/common/loading-skeleton';
import { PageHeader } from '@/components/common/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/errors';
import { refreshStaleTask } from '@/lib/query-invalidation';
import { isStaleTaskError, useUpdateTask } from '../hooks/use-task-mutations';
import { useTask } from '../hooks/use-task-queries';
import { ADMIN_TASKS_PATH, adminTaskHref, isTaskNotFoundError } from '../lib/paths';
import { toastUnlessInline } from './create-task-view';
import { TaskForm } from './task-form';
import { TaskNotFound } from './task-not-found';

export function EditTaskView({ taskId }: { taskId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const taskQuery = useTask(taskId);
  const updateMutation = useUpdateTask();
  const detailHref = adminTaskHref(taskId);

  if (taskQuery.isPending) {
    return (
      <>
        <h1 className="sr-only">Edit task</h1>
        <LoadingSkeleton rows={5} label="Loading task" />
      </>
    );
  }
  if (taskQuery.isError) {
    if (isTaskNotFoundError(taskQuery.error)) {
      return <TaskNotFound backHref={ADMIN_TASKS_PATH} backLabel="Back to tasks" />;
    }
    return (
      <>
        <h1 className="sr-only">Edit task</h1>
        <ErrorState
          title="Could not load the task"
          error={taskQuery.error}
          onRetry={() => void taskQuery.refetch()}
          retrying={taskQuery.isFetching}
        />
      </>
    );
  }

  const task = taskQuery.data;
  if (task.status === TaskStatus.COMPLETED) {
    return (
      <>
        <PageHeader title="Edit task" description={task.title} />
        <Alert>
          <Lock aria-hidden="true" />
          <AlertTitle>This task is completed</AlertTitle>
          <AlertDescription>
            <p>Completed tasks are final and can no longer be edited.</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={detailHref}>Back to the task</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Edit task" description={task.title} />
      <TaskForm
        mode="edit"
        task={task}
        cancelHref={detailHref}
        pending={updateMutation.isPending || updateMutation.isSuccess}
        onSubmit={async (patch) => {
          try {
            await updateMutation.mutateAsync({ id: task.id, patch });
            router.push(detailHref);
          } catch (error) {
            toastUnlessInline(error, 'Could not save the task.');
            if (isStaleTaskError(error)) {
              await refreshStaleTask(queryClient, task.id);
              // Approved meanwhile (409 TASK_COMPLETED): show the final state on the detail page.
              if (isApiError(error) && error.code === 'TASK_COMPLETED') router.push(detailHref);
            }
            throw error;
          }
        }}
      />
    </>
  );
}
