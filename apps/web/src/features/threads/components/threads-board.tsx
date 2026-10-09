import { Link } from '@tanstack/react-router';
import { BookOpen, CircleAlert, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { useThreads } from '../api/use-threads';
import { ThreadCard, ThreadCardSkeleton } from './thread-card';

/** Home's list: skeletons while loading, an empty state for a new install, and "Load more". */
export function ThreadsBoard() {
  const threads = useThreads();

  if (threads.isPending) {
    return (
      <ul
        aria-label="Loading threads"
        aria-busy="true"
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index}>
            <ThreadCardSkeleton />
          </li>
        ))}
      </ul>
    );
  }

  if (threads.isError) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Couldn't load threads"
        description="Check your connection, then try again."
        action={
          <Button variant="outline" onClick={() => void threads.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const items = threads.data.pages.flatMap((page) => page.items);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Nothing saved yet"
        description="Save some text to start a thread you can come back to and discuss."
        action={
          <Button asChild>
            <Link to="/new">
              <Plus />
              Save text
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <ul className="grid w-full gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((thread) => (
          <li key={thread.id}>
            <ThreadCard thread={thread} />
          </li>
        ))}
      </ul>
      {threads.hasNextPage && (
        <Button
          variant="outline"
          onClick={() => void threads.fetchNextPage()}
          disabled={threads.isFetchingNextPage}
        >
          {threads.isFetchingNextPage && <Loader2 className="animate-spin" />}
          {threads.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}
