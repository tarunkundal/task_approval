import type { Metadata } from 'next';
import { PageHeader } from '@/components/common/page-header';
import { CreateEmployeeDialog } from '@/features/users/components/create-employee-dialog';
import { EmployeesTable } from '@/features/users/components/employees-table';

export const metadata: Metadata = { title: 'Employees' };

export default function EmployeesPage() {
  return (
    <>
      <PageHeader
        title="Employees"
        description="Employee accounts that tasks can be assigned to."
        actions={<CreateEmployeeDialog />}
      />
      <EmployeesTable />
    </>
  );
}
