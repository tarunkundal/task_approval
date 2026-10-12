'use client';

import type { TaskListQuery } from '@workspace/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  DEFAULT_LIST_PARAMS,
  hasActiveFilters,
  parseListParams,
  toSearchString,
} from '../lib/list-params';

/**
 * Task-list state synced with the URL query string, so reload and back/forward restore it.
 * Filter, search and sort changes replace the history entry and go back to page 1;
 * page changes push a new entry.
 */
export function useTaskListParams() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const params = useMemo(() => parseListParams(searchParams), [searchParams]);

  const navigate = useCallback(
    (next: TaskListQuery, mode: 'push' | 'replace') => {
      const qs = toSearchString(next);
      const href = qs ? `${pathname}?${qs}` : pathname;
      if (mode === 'push') router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, router],
  );

  const setParams = useCallback(
    (partial: Partial<TaskListQuery>) => navigate({ ...params, ...partial, page: 1 }, 'replace'),
    [navigate, params],
  );

  const setPage = useCallback(
    (page: number) => navigate({ ...params, page }, 'push'),
    [navigate, params],
  );

  /** Clears status, priority, employee and search; keeps sort order and page size. */
  const clearFilters = useCallback(
    () =>
      navigate(
        {
          ...DEFAULT_LIST_PARAMS,
          pageSize: params.pageSize,
          sort: params.sort,
          order: params.order,
        },
        'replace',
      ),
    [navigate, params],
  );

  return { params, setParams, setPage, clearFilters, filtered: hasActiveFilters(params) };
}
