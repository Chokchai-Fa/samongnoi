import { serverEventSchema, type PresenceUser, type ServerEvent } from '@repo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGuest } from '@/features/guest/hooks/use-guest';
import { threadKeys } from '@/features/threads/api/use-threads';
import {
  applyMessageEvent,
  messageKeys,
  reconnectDelayMs,
  socketProtocols,
  socketUrl,
  type MessagePages,
} from '../lib/chat-state';

/** Close code the server uses when the thread was deleted. */
const THREAD_DELETED_CLOSE = 4404;
/** How long a typing indicator stays after the last ping from that person. */
const TYPING_FOR_MS = 3000;
/** Our own typing pings are sent at most this often. */
const TYPING_SEND_EVERY_MS = 2000;

interface Typer {
  name: string;
  until: number;
}

/**
 * The thread's live connection: messages, presence and typing. Reconnects with backoff, reloads
 * the conversation after every (re)connect so nothing missed while offline is lost, and
 * reconnects as soon as the tab is visible again (mobile browsers suspend sockets in background).
 */
export function useThreadRoom(threadId: string, options: { onDeleted: () => void }) {
  const guest = useGuest();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [typers, setTypers] = useState<Record<string, Typer>>({});
  const socket = useRef<WebSocket | null>(null);
  const lastTypingSent = useRef(0);
  const onDeleted = useRef(options.onDeleted);
  useEffect(() => {
    onDeleted.current = options.onDeleted;
  });

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const dispatch = (event: ServerEvent) => {
      switch (event.type) {
        case 'presence':
          setPresence(event.users);
          return;
        case 'typing':
          setTypers((previous) => ({
            ...previous,
            [event.presenceId]: { name: event.name, until: Date.now() + TYPING_FOR_MS },
          }));
          return;
        case 'thread.updated':
          void queryClient.invalidateQueries({ queryKey: threadKeys.detail(threadId) });
          void queryClient.invalidateQueries({ queryKey: threadKeys.lists });
          return;
        case 'thread.deleted':
          onDeleted.current();
          return;
        default:
          queryClient.setQueryData<MessagePages>(messageKeys.list(threadId), (data) =>
            applyMessageEvent(data, event),
          );
      }
    };

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(
        socketUrl(threadId, guest.clientName),
        socketProtocols(guest.clientId),
      );
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        // Anything sent while we were away is in the database, so re-read it.
        void queryClient.invalidateQueries({ queryKey: messageKeys.list(threadId) });
      };
      ws.onmessage = (raw) => {
        try {
          const parsed = serverEventSchema.safeParse(JSON.parse(String(raw.data)));
          if (parsed.success) dispatch(parsed.data);
        } catch {
          // A malformed frame is dropped; the next reload brings the truth.
        }
      };
      ws.onclose = (event) => {
        setConnected(false);
        if (closed) return;
        if (event.code === THREAD_DELETED_CLOSE) {
          onDeleted.current();
          return;
        }
        attempt += 1;
        retryTimer = setTimeout(connect, reconnectDelayMs(attempt));
      };
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || closed) return;
      const state = socket.current?.readyState;
      if (state === undefined || state === WebSocket.CLOSING || state === WebSocket.CLOSED) {
        clearTimeout(retryTimer);
        attempt = 0;
        connect();
      }
    };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      socket.current?.close();
      socket.current = null;
      setConnected(false);
    };
  }, [threadId, guest.clientId, guest.clientName, queryClient]);

  // Drop typing indicators once they expire.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTypers((previous) => {
        const live = Object.fromEntries(
          Object.entries(previous).filter(([, typer]) => typer.until > now),
        );
        return Object.keys(live).length === Object.keys(previous).length ? previous : live;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const sendTyping = useCallback(() => {
    const ws = socket.current;
    const now = Date.now();
    if (ws?.readyState === WebSocket.OPEN && now - lastTypingSent.current > TYPING_SEND_EVERY_MS) {
      lastTypingSent.current = now;
      ws.send(JSON.stringify({ type: 'typing' }));
    }
  }, []);

  // Expired typers are removed by the interval above, so rendering never reads the clock.
  const typingNames = Object.values(typers).map((typer) => typer.name);

  return { connected, presence, typingNames, sendTyping };
}
