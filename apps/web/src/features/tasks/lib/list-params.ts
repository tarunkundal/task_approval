import {
  taskListQuerySchema,
  type SortOrder,
  type TaskListQuery,
  type TaskSortField,
} from '@workspace/shared';
import type { TaskListParams } from '@/lib/query-keys';

/**
 * Task-list state kept in the URL (docs/phase5-plan.md P12). Only these keys are read, and each
 * value is validated with the shared `taskListQuerySchema`, so an invalid or unknown URL
 * parameter is dropped instead of being forwarded to the strict API query (unknown key → 400).
 */
export const LIST_PARAM_KEYS = [
  'page',
  'pageSize',
  'status',
  'priority',
  'assignedToId',
  'q',
  'sort',
  'order',
] as const satisfies readonly (keyof TaskListQuery)[];

type ListParamKey = (typeof LIST_PARAM_KEYS)[number];

/** `{ page: 1, pageSize: 20, sort: 'createdAt', order: 'desc' }` from the shared schema. */
export const DEFAULT_LIST_PARAMS: TaskListQuery = taskListQuerySchema.parse({});

/** The filter keys cleared by "Clear filters" (sort and page size are kept). */
export const FILTER_KEYS = ['status', 'priority', 'assignedToId', 'q'] as const;

interface SearchParamsLike {
  get(name: string): string | null;
}

function pick<K extends ListParamKey>(key: K, raw: string | null): TaskListQuery[K] | undefined {
  if (raw === null) return undefined;
  const result = taskListQuerySchema.shape[key].safeParse(raw);
  if (!result.success) return undefined;
  const value = result.data as TaskListQuery[K] | undefined;
  // A blank search (`q=` or `q=%20`) means "no search".
  if (value === '') return undefined;
  return value;
}

/** Valid list state from the URL, with defaults for anything missing or invalid. */
export function parseListParams(search: SearchParamsLike): TaskListQuery {
  const params: TaskListQuery = { ...DEFAULT_LIST_PARAMS };
  for (const key of LIST_PARAM_KEYS) {
    const value = pick(key, search.get(key));
    if (value !== undefined) (params as Record<ListParamKey, unknown>)[key] = value;
  }
  return params;
}

/** Only the non-default, non-empty values: the API query and the list's query-key part. */
export function toApiQuery(params: TaskListParams): TaskListParams {
  const query: TaskListParams = {};
  for (const key of LIST_PARAM_KEYS) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (value === DEFAULT_LIST_PARAMS[key]) continue;
    (query as Record<ListParamKey, unknown>)[key] =
      typeof value === 'string' ? value.trim() : value;
  }
  return query;
}

/** `URLSearchParams` string (no leading `?`) for `params`, defaults omitted, stable key order. */
export function toSearchString(params: TaskListParams): string {
  const query = toApiQuery(params);
  const search = new URLSearchParams();
  for (const key of LIST_PARAM_KEYS) {
    const value = query[key];
    if (value !== undefined) search.set(key, String(value));
  }
  return search.toString();
}

export function hasActiveFilters(params: TaskListParams): boolean {
  return FILTER_KEYS.some((key) => params[key] !== undefined && params[key] !== '');
}

export interface SortOption {
  value: `${TaskSortField}:${SortOrder}`;
  label: string;
  sort: TaskSortField;
  order: SortOrder;
}

function option(sort: TaskSortField, order: SortOrder, label: string): SortOption {
  return { value: `${sort}:${order}`, label, sort, order };
}

/** Every sort/order pair the API accepts, so any valid URL value has a visible label. */
export const SORT_OPTIONS: readonly SortOption[] = [
  option('createdAt', 'desc', 'Newest first'),
  option('createdAt', 'asc', 'Oldest first'),
  option('dueDate', 'asc', 'Due date: soonest'),
  option('dueDate', 'desc', 'Due date: latest'),
  option('priority', 'desc', 'Priority: high to low'),
  option('priority', 'asc', 'Priority: low to high'),
  option('updatedAt', 'desc', 'Recently updated'),
  option('updatedAt', 'asc', 'Least recently updated'),
];

export function sortValue(params: Pick<TaskListQuery, 'sort' | 'order'>): SortOption['value'] {
  return `${params.sort}:${params.order}`;
}

export function findSortOption(value: string): SortOption | undefined {
  return SORT_OPTIONS.find((item) => item.value === value);
}
