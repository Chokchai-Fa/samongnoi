import { createRootRoute, Link, Outlet } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';

export const Route = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">This page doesn&apos;t exist.</p>
        <Button asChild>
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="flex flex-col items-center gap-2 py-16 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground break-words">
          {error instanceof Error ? error.message : 'Unexpected error'}
        </p>
      </div>
    </AppShell>
  ),
});
