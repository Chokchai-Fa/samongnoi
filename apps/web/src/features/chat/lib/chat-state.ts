import {
  REALTIME_CLIENT_PROTOCOL,
  REALTIME_PROTOCOL,
  type MessageList,
  type ServerEvent,
} from '@repo/shared';
import type { InfiniteData } from '@tanstack/react-query';

export type MessagePages = InfiniteData<MessageList>;

export const messageKeys = {
  list: (threadId: string) => ['messages', threadId] as const,
};

/**
 * Pages are newest first (page 0 is the newest). Flattened for display, they read oldest → newest:
 * the last-loaded (oldest) page comes first.
 */
export function flattenMessages(data: MessagePages | undefined): MessageList['items'] {
  if (!data) return [];
  return data.pages
    .slice()
    .reverse()
    .flatMap((page) => page.items);
}

function mapMessage(
  data: MessagePages,
  messageId: string,
  change: (message: MessageList['items'][number]) => MessageList['items'][number],
): MessagePages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((message) => (message.id === messageId ? change(message) : message)),
    })),
  };
}

/** Applies one live message event to the cached conversation. Other events leave it unchanged. */
export function applyMessageEvent(
  data: MessagePages | undefined,
  event: ServerEvent,
): MessagePages | undefined {
  if (!data || data.pages.length === 0) return data;
  switch (event.type) {
    case 'message.created': {
      const exists = flattenMessages(data).some((message) => message.id === event.message.id);
      if (exists) return mapMessage(data, event.message.id, () => event.message);
      const [newest, ...older] = data.pages;
      if (!newest) return data;
      return { ...data, pages: [{ ...newest, items: [...newest.items, event.message] }, ...older] };
    }
    case 'message.delta':
      return mapMessage(data, event.messageId, (message) => ({
        ...message,
        content: message.content + event.text,
        status: message.status === 'failed' ? message.status : 'streaming',
      }));
    case 'message.completed':
      return mapMessage(data, event.messageId, (message) => ({
        ...message,
        content: event.content,
        status: 'complete',
        error: null,
      }));
    case 'message.failed':
      return mapMessage(data, event.messageId, (message) => ({
        ...message,
        status: 'failed',
        error: event.error,
      }));
    default:
      return data;
  }
}

/** Same origin as the page, so the Vite dev proxy (and production) carry the socket. */
export function socketUrl(threadId: string, name: string): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/api/threads/${threadId}/ws?name=${encodeURIComponent(name)}`;
}

/** Browsers cannot send headers on a WebSocket, so the guest id travels as a subprotocol. */
export function socketProtocols(clientId: string): string[] {
  return [REALTIME_PROTOCOL, `${REALTIME_CLIENT_PROTOCOL}${clientId}`];
}

/** Reconnect delay: 1 s, 2 s, 4 s … capped at 30 s. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
}
