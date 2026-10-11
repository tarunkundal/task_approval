import type { Priority, Role, TaskStatus } from './enums.js';

/** Public user shape returned by the API. Never includes the password hash. */
export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** Assignee / creator embedded in a task. */
export interface TaskUserDto {
  id: string;
  name: string;
  email: string;
}

export interface TaskDto {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  /** Calendar date, `YYYY-MM-DD`. */
  dueDate: string;
  assignedTo: TaskUserDto;
  createdBy: TaskUserDto;
  reviewedBy: { id: string; name: string } | null;
  /** ISO 8601 timestamp. */
  reviewedAt: string | null;
  /** Reason of the latest rejection while the task is back IN_PROGRESS; otherwise null. */
  latestRejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Author / actor shown on comments and history. No email or password hash. */
export interface ActorDto {
  id: string;
  name: string;
  role: Role;
}

export interface CommentDto {
  id: string;
  body: string;
  author: ActorDto;
  createdAt: string;
}

export interface TaskHistoryDto {
  id: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  reason: string | null;
  actor: ActorDto;
  createdAt: string;
}

export interface DashboardSummaryDto {
  total: number;
  byStatus: Record<TaskStatus, number>;
  /** dueDate before today (UTC) and status not COMPLETED. */
  overdue: number;
}
