import type { ServerEvent } from '@repo/shared';
import type { ThreadRoom } from '../durable-objects/thread-room';
import type { AnswerRequest } from '../types/chat';

/** Headers the Worker sets on an upgrade it forwards to a room. Clients cannot choose them. */
export const PRESENCE_HEADER = 'X-Presence-Id';
export const NAME_HEADER = 'X-Display-Name';

/** How the services talk to a thread's room (its Durable Object). Faked in tests. */
export interface RoomClient {
  ask(threadId: string, job: AnswerRequest): Promise<void>;
  notify(threadId: string, event: ServerEvent): Promise<void>;
  connect(threadId: string, request: Request): Promise<Response>;
}

export function createRooms(namespace: DurableObjectNamespace<ThreadRoom>): RoomClient {
  const stub = (threadId: string) => namespace.get(namespace.idFromName(threadId));
  return {
    ask: (threadId, job) => stub(threadId).ask(job),
    notify: (threadId, event) => stub(threadId).notify(event),
    connect: (threadId, request) => stub(threadId).fetch(request),
  };
}

/** Best-effort notification: a room being unreachable must not fail the work that caused it. */
export async function notifyRoom(
  rooms: RoomClient,
  threadId: string,
  event: ServerEvent,
): Promise<void> {
  try {
    await rooms.notify(threadId, event);
  } catch (error) {
    console.warn('Could not notify the room', {
      threadId,
      event: event.type,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
}
