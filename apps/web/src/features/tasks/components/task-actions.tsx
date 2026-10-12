'use client';

import { LoadingButton } from '@/components/common/loading-button';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/components/current-user-provider';
import { availableActions } from '@/lib/workflow';
import { Role, TaskStatus, type TaskAction, type TaskDto } from '@workspace/shared';
import { Check, CirclePlay, Pencil, Send, Trash2, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BodylessTaskAction } from '../api/tasks-api';
import { useTaskTransition } from '../hooks/use-task-mutations';
import { ADMIN_TASKS_PATH, adminTaskEditHref } from '../lib/paths';
import { DeleteTaskDialog } from './delete-task-dialog';
import { RejectTaskDialog } from './reject-task-dialog';

const BODYLESS_ACTIONS: Record<
  BodylessTaskAction,
  { label: string; pendingLabel: string; icon: LucideIcon }
> = {
  start: { label: 'Start task', pendingLabel: 'Starting…', icon: CirclePlay },
  submit: { label: 'Submit for approval', pendingLabel: 'Submitting…', icon: Send },
  approve: { label: 'Approve', pendingLabel: 'Approving…', icon: Check },
};

/** The only workflow actions an employee can ever be offered. */
const EMPLOYEE_ACTIONS: ReadonlySet<TaskAction> = new Set<TaskAction>(['start', 'submit']);

/**
 * Buttons for the task detail page. Workflow buttons come from the shared state machine
 * (`availableActions`); Edit / Delete render for admins only. The API stays the authority:
 * a 409 is toasted and the task refetched (see `useTaskTransition`).
 */
export function TaskActions({ task }: { task: TaskDto }) {
  const user = useCurrentUser();
  const router = useRouter();
  const transition = useTaskTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isAdmin = user.role === Role.ADMIN;
  // Employees: Start (PENDING) and Submit (IN_PROGRESS) on their own tasks only. Review
  // actions and Edit / Delete are additionally gated on the ADMIN role, not only the helper.
  const actions = availableActions(task, user).filter(
    (action) => isAdmin || EMPLOYEE_ACTIONS.has(action),
  );
  const busy = transition.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => {
        if (action === 'reject') {
          return <RejectTaskDialog key={action} task={task} disabled={busy} />;
        }
        const config = BODYLESS_ACTIONS[action];
        const Icon = config.icon;
        const loading = busy && transition.variables?.action === action;
        return (
          <LoadingButton
            key={action}
            type="button"
            loading={loading}
            loadingText={config.pendingLabel}
            disabled={busy}
            onClick={() => transition.mutate({ id: task.id, action })}
          >
            <Icon aria-hidden="true" />
            {config.label}
          </LoadingButton>
        );
      })}

      {isAdmin && task.status !== TaskStatus.COMPLETED ? (
        <Button asChild variant="outline">
          <Link href={adminTaskEditHref(task.id)}>
            <Pencil aria-hidden="true" />
            Edit
          </Link>
        </Button>
      ) : null}

      {isAdmin ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
          <DeleteTaskDialog
            task={task}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onDeleted={() => router.push(ADMIN_TASKS_PATH)}
          />
        </>
      ) : null}
    </div>
  );
}
