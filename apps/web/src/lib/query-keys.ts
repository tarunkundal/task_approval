import type { TaskListQuery } from '@workspace/shared';

/** API query parameters as sent (defaults omitted), used as part of the list key. */
export type TaskListParams = Partial<TaskListQuery>;

/**
 * Single source of query keys. Hierarchical so a prefix invalidates every descendant,
 * e.g. `invalidateQueries({ queryKey: queryKeys.tasks.lists() })` refreshes every list page.
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  dashboard: {
    summary: ['dashboard', 'summary'] as const,
  },
  users: {
    list: ['users', 'list'] as const,
  },
  tasks: {
    all: ['tasks'] as const,
    lists: () => ['tasks', 'list'] as const,
    list: (params: TaskListParams) => ['tasks', 'list', params] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
    comments: (id: string) => ['tasks', 'detail', id, 'comments'] as const,
    history: (id: string) => ['tasks', 'detail', id, 'history'] as const,
  },
} as const;
