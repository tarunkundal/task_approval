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

type IgnorableKey = 'q' | 'assignedToId';

/**
 * Task-list state synced with the URL query string, so reload and back/forward restore it.
 * Filter, search and sort changes replace the history entry and go back to page 1;
 * page changes push a new entry.
 */
export function useTaskListParams({
  ignore = [],
}: {
  /**
   * URL keys whose control isn't shown (e.g. search and employee on the employee list). They are
   * dropped so a hand-edited URL can't apply a filter the user can't see, and the next
   * navigation removes them from the URL.
   */
  ignore?: readonly IgnorableKey[];
} = {}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const ignored = ignore.join(',');
  const params = useMemo(() => {
    const parsed = parseListParams(searchParams);
    for (const key of ignored ? ignored.split(',') : []) delete parsed[key as IgnorableKey];
    return parsed;
  }, [searchParams, ignored]);

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
