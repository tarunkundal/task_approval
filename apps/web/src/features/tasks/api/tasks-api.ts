import type {
  CommentDto,
  CreateCommentInput,
  CreateTaskInput,
  PaginatedResponse,
  TaskDto,
  TaskHistoryDto,
  UpdateTaskInput,
} from '@workspace/shared';
import { api } from '@/lib/api/client';
import type { TaskListParams } from '@/lib/query-keys';

/** Workflow actions that take no body (`POST /tasks/:id/<action>`). */
export type BodylessTaskAction = 'start' | 'submit' | 'approve';

function taskPath(id: string, suffix = ''): string {
  return `/tasks/${encodeURIComponent(id)}${suffix}`;
}

/** `GET /tasks`. Pass only validated params (see `toApiQuery`); the API query is strict. */
export function listTasks(query: TaskListParams): Promise<PaginatedResponse<TaskDto>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return api.get<PaginatedResponse<TaskDto>>(qs ? `/tasks?${qs}` : '/tasks');
}

export function getTask(id: string): Promise<TaskDto> {
  return api.get<TaskDto>(taskPath(id));
}

export function createTask(input: CreateTaskInput): Promise<TaskDto> {
  return api.post<TaskDto>('/tasks', input);
}

/** `PATCH /tasks/:id` with only the changed fields (strict whitelist, ≥ 1 field). */
export function updateTask(id: string, patch: UpdateTaskInput): Promise<TaskDto> {
  return api.patch<TaskDto>(taskPath(id), patch);
}

/** Soft delete (204). */
export function deleteTask(id: string): Promise<void> {
  return api.delete<void>(taskPath(id));
}

/** start / submit / approve: no body is sent. */
export function runTaskAction(id: string, action: BodylessTaskAction): Promise<TaskDto> {
  return api.post<TaskDto>(taskPath(id, `/${action}`));
}

export function rejectTask(id: string, reason: string): Promise<TaskDto> {
  return api.post<TaskDto>(taskPath(id, '/reject'), { reason });
}

export async function listComments(id: string): Promise<CommentDto[]> {
  const response = await api.get<{ data: CommentDto[] }>(taskPath(id, '/comments'));
  return response.data;
}

export function addComment(id: string, input: CreateCommentInput): Promise<CommentDto> {
  return api.post<CommentDto>(taskPath(id, '/comments'), input);
}

export async function listHistory(id: string): Promise<TaskHistoryDto[]> {
  const response = await api.get<{ data: TaskHistoryDto[] }>(taskPath(id, '/history'));
  return response.data;
}
