'use client';

import {
  PRIORITIES,
  TASK_STATUSES,
  type Priority,
  type TaskListQuery,
  type TaskStatus,
} from '@workspace/shared';
import { Search, X } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEmployees } from '@/features/users/hooks/use-employees';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { PRIORITY_LABEL, STATUS_LABEL } from '@/lib/labels';
import { findSortOption, SORT_OPTIONS, sortValue } from '../lib/list-params';

/** Radix Select can't use "" as an item value; this sentinel means "no filter". */
const ALL = 'all';

interface TaskFiltersProps {
  params: TaskListQuery;
  onChange: (partial: Partial<TaskListQuery>) => void;
  onClear: () => void;
  filtered: boolean;
  showSearch?: boolean;
  showEmployeeFilter?: boolean;
}

export function TaskFilters({
  params,
  onChange,
  onClear,
  filtered,
  showSearch = false,
  showEmployeeFilter = false,
}: TaskFiltersProps) {
  const ids = {
    search: useId(),
    status: useId(),
    priority: useId(),
    employee: useId(),
    sort: useId(),
  };

  return (
    <div
      role="search"
      aria-label="Filter tasks"
      className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
    >
      {showSearch ? (
        <SearchInput id={ids.search} value={params.q} onSearch={(q) => onChange({ q })} />
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor={ids.status}>Status</Label>
        <Select
          value={params.status ?? ALL}
          onValueChange={(value) =>
            onChange({ status: value === ALL ? undefined : (value as TaskStatus) })
          }
        >
          <SelectTrigger id={ids.status} className="w-full lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {TASK_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={ids.priority}>Priority</Label>
        <Select
          value={params.priority ?? ALL}
          onValueChange={(value) =>
            onChange({ priority: value === ALL ? undefined : (value as Priority) })
          }
        >
          <SelectTrigger id={ids.priority} className="w-full lg:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All priorities</SelectItem>
            {PRIORITIES.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showEmployeeFilter ? (
        <EmployeeFilter
          id={ids.employee}
          value={params.assignedToId}
          onChange={(assignedToId) => onChange({ assignedToId })}
        />
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor={ids.sort}>Sort by</Label>
        <Select
          value={sortValue(params)}
          onValueChange={(value) => {
            const option = findSortOption(value);
            if (option) onChange({ sort: option.sort, order: option.order });
          }}
        >
          <SelectTrigger id={ids.sort} className="w-full lg:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered ? (
        <Button type="button" variant="ghost" onClick={onClear} className="self-start lg:self-end">
          <X aria-hidden="true" />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Title search, debounced 300 ms before it reaches the URL. The text follows the URL when it
 * changes from outside (back/forward, "Clear filters") without fighting the user's typing.
 */
function SearchInput({
  id,
  value,
  onSearch,
}: {
  id: string;
  value: string | undefined;
  onSearch: (q: string | undefined) => void;
}) {
  const [text, setText] = useState(value ?? '');
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    // Adjusting state during render (React's "derived state" pattern), not in an effect.
    setSyncedValue(value);
    if ((value ?? '') !== text.trim()) setText(value ?? '');
  }

  const debounced = useDebouncedValue(text, 300);
  // Reads the latest URL value without re-running the effect when it changes.
  const commit = useEffectEvent((next: string) => {
    const q = next.trim();
    if (q !== (value ?? '')) onSearch(q || undefined);
  });
  useEffect(() => {
    commit(debounced);
  }, [debounced]);

  return (
    <div className="grid gap-1.5 lg:min-w-64 lg:flex-1">
      <Label htmlFor={id}>Search by title</Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={id}
          type="search"
          value={text}
          maxLength={100}
          onChange={(event) => setText(event.target.value)}
          placeholder="e.g. onboarding"
          className="pl-8"
        />
      </div>
    </div>
  );
}

function EmployeeFilter({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string | undefined;
  onChange: (assignedToId: string | undefined) => void;
}) {
  const employees = useEmployees();
  const list = employees.data ?? [];
  // A URL id that isn't a known employee still gets a visible label.
  const unknown = value && employees.isSuccess && !list.some((item) => item.id === value);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Employee</Label>
      <Select
        value={value ?? ALL}
        onValueChange={(next) => onChange(next === ALL ? undefined : next)}
        disabled={employees.isPending}
      >
        <SelectTrigger id={id} className="w-full lg:w-48">
          <SelectValue placeholder={employees.isPending ? 'Loading…' : 'All employees'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All employees</SelectItem>
          {unknown ? <SelectItem value={value}>Unknown employee</SelectItem> : null}
          {list.map((employee) => (
            <SelectItem key={employee.id} value={employee.id}>
              {employee.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {employees.isError ? (
        <p className="text-xs text-destructive" role="alert">
          Could not load employees.
        </p>
      ) : null}
    </div>
  );
}
