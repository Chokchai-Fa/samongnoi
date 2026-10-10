import { NotFoundError } from '../lib/errors';
import { NAME_HEADER, PRESENCE_HEADER } from '../lib/rooms';
import { findThreadById } from '../repositories/threads.repository';
import type { Deps } from '../types/deps';

/** Hands a WebSocket upgrade to the thread's room, with the caller's identity set by us. */
export async function connectToRoom(
  deps: Deps,
  input: { threadId: string; presenceId: string; name: string },
  request: Request,
): Promise<Response> {
  const thread = await findThreadById(deps.db, input.threadId);
  if (!thread) throw new NotFoundError('Thread not found');
  const headers = new Headers(request.headers);
  headers.set(PRESENCE_HEADER, input.presenceId);
  headers.set(NAME_HEADER, input.name);
  return deps.rooms.connect(input.threadId, new Request(request.url, { headers }));
}
