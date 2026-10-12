import type { ReactNode } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppHeader } from './app-header';
import { AppSidebar } from './app-sidebar';
import { SkipLink } from './skip-link';

/**
 * Signed-in layout: collapsible sidebar on desktop (offcanvas), a sheet/drawer on mobile
 * (handled by the shadcn sidebar), header with the user and logout, then the page content.
 */
export function AppShell({ defaultOpen, children }: { defaultOpen: boolean; children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <SkipLink />
      <AppSidebar />
      <SidebarInset id="main-content" tabIndex={-1} className="outline-none">
        <AppHeader />
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
