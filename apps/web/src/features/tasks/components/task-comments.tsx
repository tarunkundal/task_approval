'use client';

import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { LoadingButton } from '@/components/common/loading-button';
import { LoadingSkeleton } from '@/components/common/loading-skeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/dates';
import { applyApiErrorToForm } from '@/lib/form-errors';
import { ROLE_LABEL } from '@/lib/labels';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { createCommentSchema } from '@workspace/shared';
import { MessageSquare } from 'lucide-react';
import { useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { reportTaskError, useAddComment } from '../hooks/use-task-mutations';
import { useTaskComments } from '../hooks/use-task-queries';

type CommentInput = z.input<typeof createCommentSchema>;
type CommentOutput = z.output<typeof createCommentSchema>;

const BODY_MAX = 2000;

/** Comment thread (oldest first) and the add-comment form. The API decides who may comment. */
export function TaskComments({ taskId }: { taskId: string }) {
  const comments = useTaskComments(taskId);

  let list;
  if (comments.isPending) {
    list = <LoadingSkeleton rows={2} label="Loading comments" />;
  } else if (comments.isError) {
    list = (
      <ErrorState
        title="Could not load comments"
        error={comments.error}
        onRetry={() => void comments.refetch()}
        retrying={comments.isFetching}
      />
    );
  } else if (comments.data.length === 0) {
    list = (
      <EmptyState
        icon={MessageSquare}
        title="No comments yet"
        description="Start the conversation below."
        className="p-6"
      />
    );
  } else {
    list = (
      <ol className="space-y-4" aria-label="Comments">
        {comments.data.map((comment) => (
          <li key={comment.id} className="rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{comment.author.name}</span>
              <Badge variant="secondary">{ROLE_LABEL[comment.author.role]}</Badge>
              <time dateTime={comment.createdAt} className="text-muted-foreground">
                {formatDateTime(comment.createdAt)}
              </time>
            </div>
            <p className="mt-2 text-sm break-words whitespace-pre-wrap">{comment.body}</p>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-semibold">
            Comments
            {comments.data ? (
              <span className="ml-1 font-normal text-muted-foreground">
                ({comments.data.length})
              </span>
            ) : null}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {list}
        <AddCommentForm taskId={taskId} />
      </CardContent>
    </Card>
  );
}

function AddCommentForm({ taskId }: { taskId: string }) {
  const queryClient = useQueryClient();
  const addComment = useAddComment(taskId);
  const bodyId = useId();
  const form = useForm<CommentInput, unknown, CommentOutput>({
    resolver: zodResolver(createCommentSchema),
    defaultValues: { body: '' },
  });
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = form;
  const body = useWatch({ control, name: 'body' }) ?? '';

  const onSubmit = handleSubmit(async (values) => {
    try {
      await addComment.mutateAsync(values);
      reset();
    } catch (error) {
      if (applyApiErrorToForm(error, setError, ['body'])) return;
      // Toasts the API message; a 404 (task deleted or reassigned) refetches the task.
      reportTaskError(queryClient, taskId, error, 'Could not add the comment.');
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <Field data-invalid={errors.body ? true : undefined}>
        <FieldLabel htmlFor={bodyId}>Add a comment</FieldLabel>
        <Textarea
          id={bodyId}
          rows={3}
          maxLength={BODY_MAX}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={[`${bodyId}-count`, errors.body ? `${bodyId}-error` : null]
            .filter(Boolean)
            .join(' ')}
          {...register('body')}
        />
        <FieldDescription id={`${bodyId}-count`}>
          {body.length}/{BODY_MAX} characters
        </FieldDescription>
        <FieldError id={`${bodyId}-error`} errors={[errors.body]} />
      </Field>
      <LoadingButton type="submit" loading={addComment.isPending} loadingText="Posting…">
        Post comment
      </LoadingButton>
    </form>
  );
}
