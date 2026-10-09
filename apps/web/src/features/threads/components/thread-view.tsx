import type { Thread } from '@repo/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Link2,
  Loader2,
  SearchX,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { GuestAvatar } from '@/features/guest/components/guest-avatar';
import { ApiError } from '@/lib/api-error';
import { formatRelativeTime } from '@/lib/format';
import { useThread } from '../api/use-thread';
import { copyThreadLink } from '../lib/copy-thread-link';
import { failedMessage, isWorking, workingMessage } from '../lib/status';
import { DeleteThreadButton } from './delete-thread-button';
import { RetryButton } from './retry-button';
import { SummaryPanel } from './summary-panel';
import { ThreadActionsMenu } from './thread-actions-menu';

/** One thread: its title and source, then the summary while it is ready, or its progress or failure. */
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
            {data.title ?? (data.sourceType === 'url' ? 'Saved link' : 'Untitled')}
          </h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {data.siteName && (
              <>
                <span>{data.siteName}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="flex items-center gap-1.5">
              <GuestAvatar name={data.creatorName} className="size-5" />
              by {data.creatorName}
            </span>
            <span aria-hidden="true">·</span>
            <time dateTime={data.createdAt}>{formatRelativeTime(data.createdAt)}</time>
            {data.isMine && <Badge variant="secondary">Mine</Badge>}
          </div>
        </div>

        {data.imageUrl && <CoverImage src={data.imageUrl} />}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void copyThreadLink(data.id)}>
            <Link2 />
            Copy link
          </Button>
          {data.sourceUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Open original
              </a>
            </Button>
          )}
        </div>
      </header>

      <ThreadBody thread={data} />
    </article>
  );
}

function ThreadBody({ thread }: { thread: Thread }) {
  if (isWorking(thread.status)) {
    return (
      <section role="status" aria-live="polite" className="flex flex-col gap-4">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {workingMessage(thread.sourceType, thread.status)}
        </p>
        <div aria-hidden="true" className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </section>
    );
  }

  if (thread.status === 'failed') {
    return (
      <section role="alert" className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
        <div className="flex items-start gap-2">
          <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">{failedMessage(thread.sourceType)}</p>
            {thread.error && <p className="text-muted-foreground break-words">{thread.error}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {thread.isMine && <RetryButton id={thread.id} />}
          {thread.sourceType === 'url' && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/new" search={{ tab: 'text' }}>
                Paste the text instead
              </Link>
            </Button>
          )}
          {thread.isMine && <DeleteThreadButton thread={thread} />}
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SummaryPanel thread={thread} />
      {thread.content && (
        <Collapsible className="flex flex-col gap-3">
          <CollapsibleTrigger className="group text-muted-foreground flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            Source text
            <ChevronDown
              className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="text-base leading-relaxed break-words whitespace-pre-wrap">
              {thread.content}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/** Link previews come from other sites: a broken one hides itself instead of showing a broken icon. */
function CoverImage({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="aspect-video w-full rounded-xl border object-cover"
    />
  );
}

function ThreadViewSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading thread"
      className="mx-auto flex w-full max-w-prose flex-col gap-6"
    >
      <Skeleton className="-ml-2 size-11 rounded-md" />
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
