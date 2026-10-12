import type { Priority, Role, TaskStatus } from '@workspace/shared';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  PENDING_APPROVAL: 'Pending approval',
  COMPLETED: 'Completed',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  EMPLOYEE: 'Employee',
};
