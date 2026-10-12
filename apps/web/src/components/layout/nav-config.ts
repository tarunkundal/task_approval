import type { Role } from '@workspace/shared';
import { LayoutDashboard, ListChecks, ListTodo, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Active only on an exact match (section home pages). */
  exact?: boolean;
}

/** Separate navigation per role (§14). */
export const NAV_ITEMS: Record<Role, NavItem[]> = {
  ADMIN: [
    { title: 'Dashboard', href: '/admin', icon: LayoutDashboard, exact: true },
    { title: 'Tasks', href: '/admin/tasks', icon: ListChecks },
    { title: 'Employees', href: '/admin/employees', icon: Users },
  ],
  EMPLOYEE: [{ title: 'My tasks', href: '/employee', icon: ListTodo }],
};

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
