import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { listEmployees } from '../api/users-api';

/** Employee list (filters, assignee picker, Employees page). */
export function useEmployees() {
  return useQuery({ queryKey: queryKeys.users.list, queryFn: listEmployees });
}
