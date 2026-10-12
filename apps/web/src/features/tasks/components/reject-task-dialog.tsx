'use client';

import { LoadingButton } from '@/components/common/loading-button';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { applyApiErrorToForm } from '@/lib/form-errors';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { rejectTaskSchema, type TaskDto } from '@workspace/shared';
import { CircleX } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { isStaleTaskError, reportTaskError, useRejectTask } from '../hooks/use-task-mutations';

type RejectInput = z.input<typeof rejectTaskSchema>;
type RejectOutput = z.output<typeof rejectTaskSchema>;

/** API limit for the reason (shared `rejectTaskSchema`). */
const REASON_MAX = 1000;

interface RejectTaskDialogProps {
  task: Pick<TaskDto, 'id' | 'title'>;
  /** Disables the trigger (e.g. while another action on the task is pending). */
  disabled?: boolean;
  size?: 'sm' | 'default';
}

/** "Reject" button + dialog with a required reason (1–1000 chars, shared schema). */
export function RejectTaskDialog({
  task,
  disabled = false,
  size = 'default',
}: RejectTaskDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const rejectMutation = useRejectTask();
  const reasonId = useId();
  const countId = useId();
  const errorId = useId();

  const form = useForm<RejectInput, unknown, RejectOutput>({
    resolver: zodResolver(rejectTaskSchema),
    defaultValues: { reason: '' },
  });
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = form;
  const reason = useWatch({ control, name: 'reason' }) ?? '';
  const pending = rejectMutation.isPending;

  const close = () => {
    setOpen(false);
    reset();
  };

  // Escape / overlay / Cancel: ignored while the request is in flight.
  const changeOpen = (next: boolean) => {
    if (pending) return;
    if (next) setOpen(true);
    else close();
  };

  const onSubmit = handleSubmit((values) => {
    rejectMutation.mutate(
      { id: task.id, reason: values.reason },
      {
        onSuccess: close,
        onError: (error) => {
          if (applyApiErrorToForm(error, setError, ['reason'])) return;
          reportTaskError(queryClient, task.id, error, 'Could not reject the task.');
          // The task is no longer awaiting approval: close and show the refetched state.
          if (isStaleTaskError(error)) close();
        },
      },
    );
  });

  const describedBy = [countId, errors.reason ? errorId : null].filter(Boolean).join(' ');

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size={size} disabled={disabled || pending}>
          <CircleX aria-hidden="true" />
          Reject
          <span className="sr-only"> &ldquo;{task.title}&rdquo;</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Reject task</DialogTitle>
            <DialogDescription>
              &ldquo;{task.title}&rdquo; goes back to the employee as In progress. They will see
              your reason.
            </DialogDescription>
          </DialogHeader>

          <Field data-invalid={errors.reason ? true : undefined}>
            <FieldLabel htmlFor={reasonId}>Reason for rejection</FieldLabel>
            <Textarea
              id={reasonId}
              rows={4}
              maxLength={REASON_MAX}
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={describedBy}
              {...register('reason')}
            />
            <FieldDescription id={countId}>
              {reason.length}/{REASON_MAX} characters
            </FieldDescription>
            <FieldError id={errorId} errors={[errors.reason]} />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <LoadingButton type="submit" loading={pending} loadingText="Rejecting…">
              Reject task
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
