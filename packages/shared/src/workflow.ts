import { Role, TaskStatus } from './enums.js';

/**
 * Single source of truth for the task state machine (ARCHITECTURE.md §5).
 * The API enforces it in the workflow service; the UI only uses it to decide which buttons to show.
 */

/** Task creation: only an ADMIN can create, and every task starts as PENDING. */
export const TASK_CREATION = {
  to: TaskStatus.PENDING,
  actorRole: Role.ADMIN,
} as const;

export const TaskAction = {
  START: 'start',
  SUBMIT: 'submit',
  APPROVE: 'approve',
  REJECT: 'reject',
} as const;
export type TaskAction = (typeof TaskAction)[keyof typeof TaskAction];

export interface TransitionRule {
  from: TaskStatus;
  to: TaskStatus;
  actorRole: Role;
  /** The actor must be the task's assignee. */
  requiresAssignee: boolean;
  /** A rejection reason (1–1000 chars) is required. */
  requiresReason: boolean;
}

export const TASK_TRANSITIONS = {
  start: {
    from: TaskStatus.PENDING,
    to: TaskStatus.IN_PROGRESS,
    actorRole: Role.EMPLOYEE,
    requiresAssignee: true,
    requiresReason: false,
  },
  submit: {
    from: TaskStatus.IN_PROGRESS,
    to: TaskStatus.PENDING_APPROVAL,
    actorRole: Role.EMPLOYEE,
    requiresAssignee: true,
    requiresReason: false,
  },
  approve: {
    from: TaskStatus.PENDING_APPROVAL,
    to: TaskStatus.COMPLETED,
    actorRole: Role.ADMIN,
    requiresAssignee: false,
    requiresReason: false,
  },
  reject: {
    from: TaskStatus.PENDING_APPROVAL,
    to: TaskStatus.IN_PROGRESS,
    actorRole: Role.ADMIN,
    requiresAssignee: false,
    requiresReason: true,
  },
} as const satisfies Record<TaskAction, TransitionRule>;

export interface WorkflowActor {
  id: string;
  role: Role;
}

export interface WorkflowTask {
  status: TaskStatus;
  assignedToId: string;
}

/** Whether `actor` may perform `action` on `task` given its current status. */
export function canPerformAction(
  action: TaskAction,
  task: WorkflowTask,
  actor: WorkflowActor,
): boolean {
  const rule: TransitionRule = TASK_TRANSITIONS[action];
  return (
    task.status === rule.from &&
    actor.role === rule.actorRole &&
    (!rule.requiresAssignee || task.assignedToId === actor.id)
  );
}

/** Actions currently available to `actor` on `task` (used by the UI to show buttons). */
export function getAvailableActions(task: WorkflowTask, actor: WorkflowActor): TaskAction[] {
  return Object.values(TaskAction).filter((action) => canPerformAction(action, task, actor));
}
