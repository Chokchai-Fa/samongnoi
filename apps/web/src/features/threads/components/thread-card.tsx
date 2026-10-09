import type { ThreadSummary } from '@repo/shared';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GuestAvatar } from '@/features/guest/components/guest-avatar';
import { formatRelativeTime } from '@/lib/format';
import { ThreadActionsMenu } from './thread-actions-menu';

/**
 * One saved thread on Home. The title link stretches over the whole card, so the card is one big
 * tap target. The ⋯ menu sits above that stretched link.
 */
export function ThreadCard({ thread }: { thread: ThreadSummary }) {
  return (
    <article className="bg-card focus-within:ring-ring relative flex h-full flex-col gap-4 rounded-xl border p-4 shadow-xs transition-colors hover:bg-accent/40 focus-within:ring-2 md:p-5">
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-base leading-snug font-semibold break-words line-clamp-2">
          <Link
            to="/threads/$id"
            params={{ id: thread.id }}
            className="rounded-sm outline-none after:absolute after:inset-0"
          >
            {thread.title ?? 'Untitled'}
          </Link>
        </h2>
        <div className="relative z-10 -mt-2 -mr-2 shrink-0">
          <ThreadActionsMenu thread={thread} />
        </div>
      </div>
      <ThreadMeta thread={thread} />
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
