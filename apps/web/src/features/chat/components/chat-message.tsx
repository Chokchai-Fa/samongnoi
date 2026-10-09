import type { Message } from '@repo/shared';
import { Sparkles } from 'lucide-react';
import { GuestAvatar } from '@/features/guest/components/guest-avatar';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/** One message. The AI's answer streams in with a caret; a failed one says why. */
export function ChatMessage({ message }: { message: Message }) {
  const isAi = message.role === 'assistant';
  const author = isAi ? 'AI' : (message.authorName ?? 'Guest');
  const streaming = message.status === 'streaming';

  return (
    <li className={cn('flex gap-3', message.isMine && 'flex-row-reverse')}>
      {isAi ? (
        <span
          className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          <Sparkles className="size-3.5" />
        </span>
      ) : (
        <GuestAvatar name={author} className="size-7" />
      )}
      <div
        className={cn(
          'flex min-w-0 max-w-[85%] flex-col gap-1 md:max-w-prose',
          message.isMine && 'items-end',
        )}
      >
        <p className="text-muted-foreground text-xs">
          {isAi ? 'AI' : message.isMine ? 'You' : author} ·{' '}
          <time dateTime={message.createdAt}>{formatRelativeTime(message.createdAt)}</time>
        </p>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 leading-relaxed break-words whitespace-pre-wrap',
            isAi ? 'bg-card border' : 'bg-secondary text-secondary-foreground',
            message.status === 'failed' && 'border-destructive',
          )}
        >
          {message.content}
          {streaming && (
            <span
              aria-hidden="true"
              className="bg-foreground ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle motion-reduce:animate-none"
            />
          )}
          {streaming && !message.content && (
            <span className="text-muted-foreground">Thinking…</span>
          )}
        </div>
        {message.status === 'failed' && message.error && (
          <p role="alert" className="text-destructive text-sm">
            {message.error}
          </p>
        )}
      </div>
    </li>
  );
}
