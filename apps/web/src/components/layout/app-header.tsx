'use client';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useCurrentUser } from '@/features/auth/components/current-user-provider';
import { ROLE_LABEL } from '@/lib/labels';
import { UserMenu } from './user-menu';

export function AppHeader() {
  const user = useCurrentUser();

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" aria-label="Toggle navigation" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <div className="ml-auto flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="max-w-[10rem] truncate text-sm font-medium sm:max-w-xs"
            data-testid="header-user-name"
          >
            {user.name}
          </span>
          <Badge variant="secondary" data-testid="header-user-role">
            {ROLE_LABEL[user.role]}
          </Badge>
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
