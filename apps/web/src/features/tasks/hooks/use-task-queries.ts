import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys, type TaskListParams } from '@/lib/query-keys';
import { getTask, listComments, listHistory, listTasks } from '../api/tasks-api';
import { toApiQuery } from '../lib/list-params';

/** A page of tasks. The params are normalised (defaults dropped) so equal lists share a key. */
export function useTaskList(params: TaskListParams) {
  const query = toApiQuery(params);
  return useQuery({
    queryKey: queryKeys.tasks.list(query),
    queryFn: () => listTasks(query),
    placeholderData: keepPreviousData,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id),
    queryFn: () => getTask(id),
  });
}

export function useTaskComments(id: string) {
  return useQuery({
    queryKey: queryKeys.tasks.comments(id),
    queryFn: () => listComments(id),
  });
}

export function useTaskHistory(id: string) {
  return useQuery({
    queryKey: queryKeys.tasks.history(id),
    queryFn: () => listHistory(id),
  });
}
