import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { CurrentUserProvider } from '@/features/auth/components/current-user-provider';
import { requireUser } from '@/lib/api/server';

/**
 * Signed-in area. Validates the session with `GET /auth/me` on every request (no session →
 * `/login?next=`). Role checks live in the admin / employee section layouts.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  // shadcn sidebar persists its desktop open/collapsed state in this cookie.
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false';

  return (
    <CurrentUserProvider user={user}>
      <AppShell defaultOpen={sidebarOpen}>{children}</AppShell>
    </CurrentUserProvider>
  );
}
