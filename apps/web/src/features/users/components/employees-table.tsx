'use client';

import { Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { TableSkeleton } from '@/components/common/table-skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useEmployees } from '../hooks/use-employees';

/** Employee accounts (name, email), ordered by name by the API. */
export function EmployeesTable({ emptyAction }: { emptyAction?: ReactNode }) {
  const employees = useEmployees();

  if (employees.isPending) {
    return <TableSkeleton rows={3} columns={2} label="Loading employees" />;
  }
  if (employees.isError) {
    return (
      <ErrorState
        title="Could not load employees"
        error={employees.error}
        onRetry={() => void employees.refetch()}
        retrying={employees.isFetching}
      />
    );
  }
  if (employees.data.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No employees yet"
        description="Create an employee account so you can assign tasks."
        action={emptyAction}
      />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableCaption className="sr-only">Employees</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Name</TableHead>
            <TableHead scope="col">Email</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.data.map((employee) => (
            <TableRow key={employee.id} data-testid="employee-row">
              <TableCell className="font-medium">{employee.name}</TableCell>
              <TableCell>{employee.email}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
