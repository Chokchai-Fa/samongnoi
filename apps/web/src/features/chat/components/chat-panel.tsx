import { useNavigate } from '@tanstack/react-router';
import { useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessages } from '../api/use-messages';
import { useSendMessage } from '../api/use-send-message';
import { flattenMessages } from '../lib/chat-state';
import { useThreadRoom } from '../realtime/use-thread-room';
import { ChatInput } from './chat-input';
import { ChatMessage } from './chat-message';
import { PresenceBar } from './presence-bar';
import { SuggestedQuestions } from './suggested-questions';
import { TypingIndicator } from './typing-indicator';

/** Within this many px of the bottom, new messages keep the view pinned to the latest. */
const FOLLOW_SLACK_PX = 80;

interface ChatPanelProps {
  threadId: string;
  ready: boolean;
  disabledReason: string;
  suggestions: string[];
}

/** The thread's conversation: live over the socket, with a polling fallback, and a question box. */
export function ChatPanel({ threadId, ready, disabledReason, suggestions }: ChatPanelProps) {
  const navigate = useNavigate();
  const room = useThreadRoom(threadId, {
    onDeleted: () => {
      toast('This thread was deleted');
      void navigate({ to: '/' });
    },
  });
  const messages = useMessages(threadId, { polling: !room.connected });
  const send = useSendMessage(threadId);
  const items = flattenMessages(messages.data);
  const latest = items.at(-1);

  const scroller = useRef<HTMLDivElement>(null);
  // `following` drives scrolling inside effects; the state drives what is rendered.
  const following = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  // How many messages the reader has seen while at (or last scrolled to) the bottom.
  const [seenCount, setSeenCount] = useState(0);

  // Follow new messages and streamed text while the reader is at the bottom.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [items.length, latest?.content]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX;
    following.current = bottom;
    setAtBottom(bottom);
    setSeenCount(items.length);
  }

  function jumpToLatest() {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    following.current = true;
    setAtBottom(true);
    setSeenCount(items.length);
  }

  const unseen = !atBottom && items.length > seenCount;

  async function ask(text: string) {
    following.current = true;
    await send.mutateAsync(text);
  }

  const empty = items.length === 0 && !messages.isPending;

  return (
    <section aria-label="Chat" className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Chat</h2>
        {room.connected ? (
          <PresenceBar users={room.presence} />
        ) : (
          <span className="text-muted-foreground text-xs">Reconnecting…</span>
        )}
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        role="log"
        aria-label="Conversation"
        className="flex min-h-[14rem] flex-1 flex-col gap-5 overflow-y-auto pr-1"
      >
        {messages.hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            className="self-center"
            disabled={messages.isFetchingNextPage}
            onClick={() => void messages.fetchNextPage()}
          >
            {messages.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
          </Button>
        )}

        {messages.isPending && (
          <div aria-busy="true" className="flex flex-col gap-3">
            <Skeleton className="h-12 w-3/5" />
            <Skeleton className="ml-auto h-12 w-2/5" />
          </div>
        )}

        {messages.isError && (
          <div role="alert" className="text-sm">
            <p>Couldn&apos;t load the conversation.</p>
            <Button variant="outline" size="sm" onClick={() => void messages.refetch()}>
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
