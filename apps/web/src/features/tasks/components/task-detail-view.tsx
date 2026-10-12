'use client';

import { ErrorState } from '@/components/common/error-state';
import { LoadingSkeleton } from '@/components/common/loading-skeleton';
import { OverdueBadge } from '@/components/common/overdue-badge';
import { PriorityBadge } from '@/components/common/priority-badge';
import { StatusBadge } from '@/components/common/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime, formatDueDate, isOverdue } from '@/lib/dates';
import type { TaskDto } from '@workspace/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTask } from '../hooks/use-task-queries';
import { isTaskNotFoundError } from '../lib/paths';
import { TaskActions } from './task-actions';
import { TaskComments } from './task-comments';
import { TaskFeedbackAlert } from './task-feedback-alert';
import { TaskHistory } from './task-history';
import { TaskNotFound } from './task-not-found';

/** Content rendered around the details card; each receives the loaded task. */
export interface TaskDetailSlots {
  /** Directly under the header (rejection feedback alert). */
  feedback?: (task: TaskDto) => ReactNode;
  /** Under the details card (comments thread). */
  main?: (task: TaskDto) => ReactNode;
  /** Side column (status history). */
  aside?: (task: TaskDto) => ReactNode;
}

/** Both roles: rejection feedback under the header, comments under the details, history aside. */
const DEFAULT_SLOTS: TaskDetailSlots = {
  feedback: (task) => <TaskFeedbackAlert task={task} />,
  main: (task) => <TaskComments taskId={task.id} />,
  aside: (task) => <TaskHistory taskId={task.id} />,
};

interface TaskDetailViewProps {
  taskId: string;
  /** The list this detail page belongs to (back link and "not found" link). */
  backHref: string;
  backLabel: string;
  /** Overrides for the feedback alert, comments and history sections. */
  slots?: TaskDetailSlots;
}

/**
 * Task detail for both roles: header, actions (per role and status), the details card, the
 * rejection feedback alert, comments and history. The API scope decides access (404 → not found).
 */
export function TaskDetailView({
  taskId,
  backHref,
  backLabel,
  slots = DEFAULT_SLOTS,
}: TaskDetailViewProps) {
  const taskQuery = useTask(taskId);

  if (taskQuery.isPending) {
    return (
      <>
        <h1 className="sr-only">Task details</h1>
        <LoadingSkeleton rows={6} label="Loading task" />
      </>
    );
  }
  if (taskQuery.isError) {
    if (isTaskNotFoundError(taskQuery.error)) {
      return <TaskNotFound backHref={backHref} backLabel={backLabel} />;
    }
    return (
      <>
        <h1 className="sr-only">Task details</h1>
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
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight break-words">{task.title}</h1>
            <div className="flex flex-wrap items-center gap-2" data-testid="task-badges">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              {isOverdue(task) ? <OverdueBadge /> : null}
            </div>
          </div>
          <TaskActions task={task} />
        </div>
      </div>

      {slots.feedback?.(task)}

      <div
        className={
          slots.aside ? 'grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : 'max-w-3xl'
        }
      >
        <div className="min-w-0 space-y-6">
          <TaskDetailsCard task={task} />
          {slots.main?.(task)}
        </div>
        {slots.aside ? <div className="min-w-0">{slots.aside(task)}</div> : null}
      </div>
    </div>
  );
}

function TaskDetailsCard({ task }: { task: TaskDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base font-semibold">Details</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
          {task.description ? (
            <p className="mt-1 text-sm break-words whitespace-pre-wrap">{task.description}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground italic">No description.</p>
          )}
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Item label="Due date">
            {/* The Overdue badge sits in the page header. */}
            <time dateTime={task.dueDate} data-testid="task-due-date">
              {formatDueDate(task.dueDate)}
            </time>
          </Item>
          <Item label="Assignee">
            {task.assignedTo.name}
            <span className="block text-muted-foreground">{task.assignedTo.email}</span>
          </Item>
          <Item label="Created by">{task.createdBy.name}</Item>
          <Item label="Created">
            <time dateTime={task.createdAt}>{formatDateTime(task.createdAt)}</time>
          </Item>
          <Item label="Last reviewed by">
            {task.reviewedBy ? (
              <>
                {task.reviewedBy.name}
                {task.reviewedAt ? (
                  <time dateTime={task.reviewedAt} className="block text-muted-foreground">
                    {formatDateTime(task.reviewedAt)}
                  </time>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">Not reviewed yet</span>
            )}
          </Item>
          <Item label="Last updated">
            <time dateTime={task.updatedAt}>{formatDateTime(task.updatedAt)}</time>
          </Item>
        </dl>
      </CardContent>
    </Card>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
