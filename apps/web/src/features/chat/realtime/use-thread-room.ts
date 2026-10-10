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
/** The longest live message events wait for a conversation re-read to land. */
const RE_READ_HOLD_MAX_MS = 5000;
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
  // Bumped by reconnect() to open a fresh socket now instead of waiting out the backoff.
  const [generation, setGeneration] = useState(0);
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
    // While the conversation is re-read after a (re)connect, message events wait here: a re-read
    // that lands after them would otherwise overwrite them with an older copy of the list.
    let reReading = false;
    const held: ServerEvent[] = [];

    const applyMessage = (event: ServerEvent) => {
      queryClient.setQueryData<MessagePages>(messageKeys.list(threadId), (data) =>
        applyMessageEvent(data, event),
      );
    };

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
          if (reReading) held.push(event);
          else applyMessage(event);
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
        // Anything sent while we were away is in the database, so re-read it. Then apply the events
        // that came in meanwhile. Deltas are skipped: the re-read may already hold their text, and
        // the completed event carries the whole answer anyway.
        reReading = true;
        const release = () => {
          if (!reReading) return;
          reReading = false;
          for (const event of held.splice(0)) {
            if (event.type !== 'message.delta') applyMessage(event);
          }
        };
        // A re-read that hangs must not hold live events for long.
        const giveUp = setTimeout(release, RE_READ_HOLD_MAX_MS);
        void queryClient.invalidateQueries({ queryKey: messageKeys.list(threadId) }).finally(() => {
          clearTimeout(giveUp);
          release();
        });
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
  }, [threadId, guest.clientId, guest.clientName, queryClient, generation]);

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

  const reconnect = useCallback(() => setGeneration((n) => n + 1), []);

  // Expired typers are removed by the interval above, so rendering never reads the clock.
  const typingNames = Object.values(typers).map((typer) => typer.name);

  return { connected, presence, typingNames, sendTyping, reconnect };
}
