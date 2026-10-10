import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMediaQuery } from '@/lib/use-media-query';
import type { useMessages } from '../api/use-messages';
import { useSendMessage } from '../api/use-send-message';
import { flattenMessages } from '../lib/chat-state';
import type { useThreadRoom } from '../realtime/use-thread-room';
import { ChatInput } from './chat-input';
import { ChatMessage } from './chat-message';
import { PresenceBar } from './presence-bar';
import { SuggestedQuestions } from './suggested-questions';
import { TypingIndicator } from './typing-indicator';

/** Within this many px of the newest message, new messages keep the view pinned to it (desktop). */
const FOLLOW_SLACK_PX = 80;
/** On phones the page scrolls, and the question box sits below the newest message. */
const PHONE_FOLLOW_SLACK_PX = 200;

export type ChatRoom = ReturnType<typeof useThreadRoom>;
export type Conversation = ReturnType<typeof useMessages>;

interface ChatPanelProps {
  threadId: string;
  ready: boolean;
  disabledReason: string;
  suggestions: string[];
  room: ChatRoom;
  conversation: Conversation;
}

/** Px from the bottom of the view to the newest message. Desktop scrolls the chat; phones scroll the page. */
function gapToEnd(scroller: HTMLElement | null, desktop: boolean): number {
  if (desktop && scroller)
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  return document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
}

function scrollToEnd(scroller: HTMLElement | null, desktop: boolean) {
  if (desktop && scroller) scroller.scrollTop = scroller.scrollHeight;
  else window.scrollTo({ top: document.documentElement.scrollHeight });
}

/** The conversation and the question box. The live room and the messages come from the thread page. */
export function ChatPanel({
  threadId,
  ready,
  disabledReason,
  suggestions,
  room,
  conversation,
}: ChatPanelProps) {
  const send = useSendMessage(threadId);
  const items = flattenMessages(conversation.data);
  const latest = items.at(-1);
  const desktop = useMediaQuery('(min-width: 1024px)');

  const scroller = useRef<HTMLDivElement>(null);
  // `following` drives scrolling inside effects; the state drives what is rendered.
  const following = useRef(true);
  // The newest count, for handlers that run outside render.
  const count = useRef(items.length);
  const [atBottom, setAtBottom] = useState(true);
  // How many messages the reader has seen while at (or last scrolled to) the bottom.
  const [seenCount, setSeenCount] = useState(0);

  useLayoutEffect(() => {
    count.current = items.length;
  });

  // Follow new messages and streamed text while the reader is at the bottom.
  useLayoutEffect(() => {
    if (following.current) scrollToEnd(scroller.current, desktop);
  }, [items.length, latest?.content, desktop]);

  const updateFollowing = useCallback(() => {
    const slack = desktop ? FOLLOW_SLACK_PX : PHONE_FOLLOW_SLACK_PX;
    const bottom = gapToEnd(scroller.current, desktop) < slack;
    following.current = bottom;
    setAtBottom(bottom);
    if (bottom) setSeenCount(count.current);
  }, [desktop]);

  // On phones the page is the thing that scrolls, so it is the one to watch.
  useEffect(() => {
    window.addEventListener('scroll', updateFollowing, { passive: true });
    return () => window.removeEventListener('scroll', updateFollowing);
  }, [updateFollowing]);

  function jumpToLatest() {
    scrollToEnd(scroller.current, desktop);
    following.current = true;
    setAtBottom(true);
    setSeenCount(count.current);
  }

  const unseen = !atBottom && items.length > seenCount;

  async function ask(text: string) {
    following.current = true;
    await send.mutateAsync(text);
  }

  const empty = items.length === 0 && !conversation.isPending;

  return (
    <section aria-label="Chat" className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Chat</h2>
        {room.connected ? (
          <PresenceBar users={room.presence} className="hidden lg:flex" />
        ) : (
          <span className="text-muted-foreground text-xs">Reconnecting…</span>
        )}
      </div>

      <div
        ref={scroller}
        onScroll={updateFollowing}
        role="log"
        aria-label="Conversation"
        className="flex min-h-[14rem] flex-1 flex-col gap-5 overflow-y-auto pr-1"
      >
        {conversation.hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            className="self-center"
            disabled={conversation.isFetchingNextPage}
            onClick={() => void conversation.fetchNextPage()}
          >
            {conversation.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
          </Button>
        )}

        {conversation.isPending && (
          <div aria-busy="true" className="flex flex-col gap-3">
            <Skeleton className="h-12 w-3/5" />
            <Skeleton className="ml-auto h-12 w-2/5" />
          </div>
        )}

        {conversation.isError && (
          <div role="alert" className="text-sm">
            <p>Couldn&apos;t load the conversation.</p>
            <Button variant="outline" size="sm" onClick={() => void conversation.refetch()}>
              Try again
            </Button>
          </div>
        )}

        {empty && (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              {ready
                ? 'Ask anything about this source. Everyone here sees the questions and answers.'
                : disabledReason}
            </p>
            {ready && (
              <SuggestedQuestions
                questions={suggestions}
                onPick={(question) => void ask(question)}
              />
            )}
          </div>
        )}

        <ol className="flex flex-col gap-5">
          {items.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
        </ol>
      </div>

      <TypingIndicator names={room.typingNames} />

      {unseen && (
        <Button
          variant="secondary"
          size="sm"
          className="self-center rounded-full"
          onClick={jumpToLatest}
        >
          New messages ↓
        </Button>
      )}

      {send.isError && (
        <p role="alert" className="text-destructive text-sm">
          {send.error.message}
        </p>
      )}

      <ChatInput
        disabled={!ready}
        disabledReason={disabledReason}
        sending={send.isPending}
        onSend={ask}
        onTyping={room.sendTyping}
      />
    </section>
  );
}
