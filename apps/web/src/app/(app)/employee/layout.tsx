import type { ReactNode } from 'react';
import { requireRole } from '@/lib/api/server';

/** Employee section: any other role is sent to its own home. The API still enforces roles. */
export default async function EmployeeLayout({ children }: { children: ReactNode }) {
  await requireRole('EMPLOYEE');
  return children;
}
