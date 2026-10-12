import type { ReactNode } from 'react';
import { requireRole } from '@/lib/api/server';

/** Admin section: any other role is sent to its own home. The API still enforces roles. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole('ADMIN');
  return children;
}
