import type { Thread } from '@repo/shared';
import { useQueryClient } from '@tanstack/react-query';
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
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { PullToRefresh } from '@/components/pull-to-refresh';
import { useMessages } from '@/features/chat/api/use-messages';
import { ChatPanel } from '@/features/chat/components/chat-panel';
import { PresenceBar } from '@/features/chat/components/presence-bar';
import { flattenMessages } from '@/features/chat/lib/chat-state';
import { useThreadRoom } from '@/features/chat/realtime/use-thread-room';
import { GuestAvatar } from '@/features/guest/components/guest-avatar';
import { ApiError } from '@/lib/api-error';
import { formatRelativeTime } from '@/lib/format';
import { useMediaQuery } from '@/lib/use-media-query';
import { useThread } from '../api/use-thread';
import { threadKeys } from '../api/use-threads';
import { copyThreadLink } from '../lib/copy-thread-link';
import { failedMessage, isWorking, workingMessage } from '../lib/status';
import { DeleteThreadButton } from './delete-thread-button';
import { RetryButton } from './retry-button';
import { SummaryPanel } from './summary-panel';
import { ThreadActionsMenu } from './thread-actions-menu';

/**
 * One thread. Phones stack it: the header, then the summary (folded away once the chat starts),
 * then the chat with its question box at the bottom. Desktop puts the source in a left pane
 * (about 2/5) and the chat in a right pane (about 3/5), each scrolling on its own.
 */
export function ThreadView({ id }: { id: string }) {
  const thread = useThread(id);

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

  // Keyed by id, so the room, the chat and the summary state start fresh for each thread.
  return <ThreadContent key={thread.data.id} thread={thread.data} />;
}

/** The loaded thread. Its live room and chat open only once the thread exists. */
function ThreadContent({ thread: data }: { thread: Thread }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const goHome = () => void navigate({ to: '/' });
  const room = useThreadRoom(data.id, {
    onDeleted: () => {
      toast('This thread was deleted');
      goHome();
    },
  });
  const conversation = useMessages(data.id, { polling: !room.connected });
  const desktop = useMediaQuery('(min-width: 1024px)');
  const touch = useMediaQuery('(pointer: coarse)');
  const ready = data.status === 'ready';
  const hasMessages = flattenMessages(conversation.data).length > 0;

  // Phones fold the summary away once the conversation starts, so the chat gets the screen.
  // A tap on the summary opens it again.
  const [summaryChoice, setSummaryChoice] = useState<boolean>();
  const summaryOpen = summaryChoice ?? (desktop || !hasMessages);

  // Pulling down and the menu's Refresh both re-read the thread and its conversation.
  async function refresh() {
    if (!room.connected) room.reconnect();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: threadKeys.detail(data.id) }),
      conversation.refetch(),
    ]);
  }

  return (
    <PullToRefresh enabled={touch} onRefresh={refresh}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-2">
          <header className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <Button asChild variant="ghost" size="icon" className="-ml-2">
                <Link to="/" aria-label="Back to threads">
                  <ArrowLeft />
                </Link>
              </Button>
              <div className="flex items-center gap-1">
                {/* Phones show who is here in the header; on desktop the chat shows it. */}
                <PresenceBar users={room.presence} className="lg:hidden" />
                <ThreadActionsMenu
                  thread={data}
                  onDelete={goHome}
                  onRefresh={() => void refresh()}
                />
              </div>
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

          <ThreadBody
            thread={data}
            summaryOpen={summaryOpen}
            onSummaryOpenChange={setSummaryChoice}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)]">
          <ChatPanel
            threadId={data.id}
            ready={ready}
            disabledReason={chatReason(data)}
            suggestions={data.suggestedQuestions ?? []}
            room={room}
            conversation={conversation}
          />
        </div>
      </div>
    </PullToRefresh>
  );
}

function chatReason(thread: Thread): string {
  if (thread.status === 'ready') return '';
  if (thread.status === 'failed')
    return "This thread didn't load, so there's nothing to ask about yet. Retry it first.";
  return 'Chat opens when the summary is ready.';
}

/** Summary (or progress or failure) and the source text. */
function ThreadBody({
  thread,
  summaryOpen,
  onSummaryOpenChange,
}: {
  thread: Thread;
  summaryOpen: boolean;
  onSummaryOpenChange: (open: boolean) => void;
}) {
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
    return <FailedBody thread={thread} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <SummaryPanel thread={thread} open={summaryOpen} onOpenChange={onSummaryOpenChange} />
      {thread.content && <SourceText content={thread.content} />}
    </div>
  );
}

function FailedBody({ thread }: { thread: Thread }) {
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

function SourceText({ content }: { content: string }) {
  return (
    <Collapsible className="flex flex-col gap-3">
      <CollapsibleTrigger className="group text-muted-foreground flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        Source text
        <ChevronDown
          className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="text-base leading-relaxed break-words whitespace-pre-wrap">{content}</div>
      </CollapsibleContent>
    </Collapsible>
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
      className="h-40 w-full rounded-xl border object-cover md:aspect-video md:h-auto"
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
