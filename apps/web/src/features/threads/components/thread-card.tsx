import type { ThreadSummary } from '@repo/shared';
import { Link } from '@tanstack/react-router';
import { CircleAlert, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GuestAvatar } from '@/features/guest/components/guest-avatar';
import { formatRelativeTime } from '@/lib/format';
import { isWorking, failedMessage, workingMessage } from '../lib/status';
import { DeleteThreadButton } from './delete-thread-button';
import { RetryButton } from './retry-button';
import { ThreadActionsMenu } from './thread-actions-menu';

/**
 * One saved thread on Home. The title link stretches over the whole card, so the card is one big
 * tap target. Buttons and the ⋯ menu sit above that link.
 */
export function ThreadCard({ thread }: { thread: ThreadSummary }) {
  const fallbackTitle = thread.sourceType === 'url' ? 'Saved link' : 'Untitled';
  return (
    <article className="bg-card focus-within:ring-ring relative flex h-full flex-col gap-4 rounded-xl border p-4 shadow-xs transition-colors hover:bg-accent/40 focus-within:ring-2 md:p-5">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-base leading-snug font-semibold break-words line-clamp-2">
          <Link
            to="/threads/$id"
            params={{ id: thread.id }}
            className="rounded-sm outline-none after:absolute after:inset-0"
          >
            {thread.title ?? fallbackTitle}
          </Link>
        </h2>
        <div className="relative z-10 -mt-2 -mr-2 shrink-0">
          <ThreadActionsMenu thread={thread} />
        </div>
      </div>
      {thread.status === 'ready' ? (
        <ThreadMeta thread={thread} />
      ) : (
        <ThreadStatusLine thread={thread} />
      )}
    </article>
  );
}

/** Same shape as ThreadCard, so the grid does not jump when the list loads. */
export function ThreadCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="bg-card flex h-full flex-col gap-4 rounded-xl border p-4 md:p-5"
    >
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-5 w-2/5" />
      <div className="mt-auto flex items-center gap-2">
        <Skeleton className="size-5 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

export function ThreadMeta({ thread }: { thread: ThreadSummary }) {
  return (
    <div className="text-muted-foreground mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {thread.siteName && (
        <>
          <span>{thread.siteName}</span>
          <span aria-hidden="true">·</span>
        </>
      )}
      <span className="flex items-center gap-1.5">
        <GuestAvatar name={thread.creatorName} className="size-5" />
        by {thread.creatorName}
      </span>
      <span aria-hidden="true">·</span>
      <time dateTime={thread.createdAt}>{formatRelativeTime(thread.createdAt)}</time>
      {thread.isMine && <Badge variant="secondary">Mine</Badge>}
    </div>
  );
}

/** The card's state while the job runs, and when it failed (with Retry and Delete for its creator). */
function ThreadStatusLine({ thread }: { thread: ThreadSummary }) {
  if (isWorking(thread.status)) {
    return (
      <div role="status" className="text-muted-foreground mt-auto flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {workingMessage(thread.sourceType, thread.status)}
      </div>
    );
  }

  return (
    <div className="mt-auto flex flex-col gap-3">
      <div className="flex items-start gap-2 text-sm">
        <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium">{failedMessage(thread.sourceType)}</p>
          {thread.error && <p className="text-muted-foreground break-words">{thread.error}</p>}
        </div>
      </div>
      {thread.isMine && (
        <div className="relative z-10 flex flex-wrap gap-2">
          <RetryButton id={thread.id} />
          <DeleteThreadButton thread={thread} />
        </div>
      )}
    </div>
  );
}
