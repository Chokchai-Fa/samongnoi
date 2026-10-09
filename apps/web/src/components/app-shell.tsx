import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { GuestNameMenu } from '@/features/guest/components/guest-name-menu';
import { ThemeToggle } from './theme-toggle';

/** Top bar + centered content. Mobile-first: compact bar, full-width content with px-4. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/80 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            samongnoi
          </Link>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
              <Link to="/new">
                <Plus />
                Save text
              </Link>
            </Button>
            <GuestNameMenu />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:py-10">
        {children}
      </main>
    </div>
  );
}
