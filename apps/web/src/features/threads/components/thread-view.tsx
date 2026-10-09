import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CircleAlert, Link2, SearchX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { GuestAvatar } from '@/features/guest/components/guest-avatar';
import { ApiError } from '@/lib/api-error';
import { formatRelativeTime } from '@/lib/format';
import { useThread } from '../api/use-thread';
import { copyThreadLink } from '../lib/copy-thread-link';
import { ThreadActionsMenu } from './thread-actions-menu';

/** One thread: title, who saved it, the text, and the actions. Chat and the summary come later. */
export function ThreadView({ id }: { id: string }) {
  const thread = useThread(id);
  const navigate = useNavigate();
  const goHome = () => void navigate({ to: '/' });

  if (thread.isPending) return <ThreadViewSkeleton />;

  if (thread.isError) {
    // 404 is the normal case; 400 means the id is malformed, which no retry can fix either.
    if (thread.error instanceof ApiError && thread.error.status < 500) {
      return (
        <EmptyState
          icon={SearchX}
          title="This thread is gone"
          description="It may have been deleted."
          action={
            <Button asChild variant="outline">
              <Link to="/">Back to threads</Link>
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={CircleAlert}
        title="Couldn't open this thread"
        description="Check your connection, then try again."
        action={
          <Button variant="outline" onClick={() => void thread.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const data = thread.data;

  return (
    <article className="mx-auto flex w-full max-w-prose flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="icon" className="-ml-2 size-11">
            <Link to="/" aria-label="Back to threads">
              <ArrowLeft />
            </Link>
          </Button>
          <ThreadActionsMenu thread={data} onDelete={goHome} />
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight break-words md:text-3xl">
            {data.title ?? 'Untitled'}
          </h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <GuestAvatar name={data.creatorName} className="size-5" />
              by {data.creatorName}
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime={data.createdAt}>{formatRelativeTime(data.createdAt)}</time>
            {data.isMine && <Badge variant="secondary">Mine</Badge>}
          </div>
        </div>

        <div>
          <Button variant="outline" size="sm" onClick={() => void copyThreadLink(data.id)}>
            <Link2 />
            Copy link
          </Button>
        </div>
      </header>

      <div className="text-base leading-relaxed break-words whitespace-pre-wrap">
        {data.content}
      </div>
    </article>
  );
}

function ThreadViewSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading thread"
      className="mx-auto flex w-full max-w-prose flex-col gap-6"
    >
      <Skeleton className="size-11 -ml-2 rounded-md" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}
