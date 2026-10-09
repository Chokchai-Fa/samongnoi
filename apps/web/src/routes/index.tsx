import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { ThreadsBoard } from '@/features/threads/components/threads-board';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Threads"
        description="Everything saved here is visible to everyone using samongnoi."
      />
      <ThreadsBoard />
      {/* Mobile's primary action: floats above the home-indicator safe area. */}
      <Button
        asChild
        size="icon-lg"
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] size-14 rounded-full shadow-lg md:hidden"
      >
        <Link to="/new" aria-label="Save text">
          <Plus />
        </Link>
      </Button>
    </div>
  );
}
