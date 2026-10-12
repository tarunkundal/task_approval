'use client';

import type { TaskDto } from '@workspace/shared';
import { LoadingButton } from '@/components/common/loading-button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { isStaleTaskError, useDeleteTask } from '../hooks/use-task-mutations';

interface DeleteTaskDialogProps {
  task: Pick<TaskDto, 'id' | 'title'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after a successful delete (e.g. navigate away from the detail page). */
  onDeleted?: () => void;
}

/** Confirmation for the (soft) delete. Stays open while the request is pending. */
export function DeleteTaskDialog({ task, open, onOpenChange, onDeleted }: DeleteTaskDialogProps) {
  const deleteMutation = useDeleteTask({
    onDeleted: () => {
      onOpenChange(false);
      onDeleted?.();
    },
  });
  const pending = deleteMutation.isPending;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this task?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{task.title}&rdquo; will be removed from task lists and dashboard counts. Its
            status history and comments are kept for the audit trail.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <LoadingButton
            type="button"
            variant="destructive"
            loading={pending}
            loadingText="Deleting…"
            onClick={() =>
              deleteMutation.mutate(task.id, {
                onError: (error) => {
                  // Already deleted elsewhere: nothing left to confirm.
                  if (isStaleTaskError(error)) onOpenChange(false);
                },
              })
            }
          >
            Delete task
          </LoadingButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
