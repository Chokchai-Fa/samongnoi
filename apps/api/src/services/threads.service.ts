import type { CreateThreadInput, Thread, ThreadList, ThreadSummary } from '@repo/shared';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import {
  deleteThreadById,
  findThreadById,
  findThreadCreatorKey,
  insertThread,
  listThreadSummaries,
  type ThreadRow,
  type ThreadSummaryRow,
} from '../repositories/threads.repository';
import type { Deps } from '../types/deps';
import type { GuestIdentity } from '../types/guest';

// Responses are built field by field so `creatorKey` (and any other stored id) never leaks.
function toSummary(row: ThreadSummaryRow, guest: GuestIdentity): ThreadSummary {
  return {
    id: row.id,
    sourceType: row.sourceType,
    status: row.status,
    title: row.title,
    siteName: row.siteName,
    imageUrl: row.imageUrl,
    error: row.error,
    creatorName: row.creatorName,
    isMine: row.creatorKey === guest.key,
    createdAt: row.createdAt.toISOString(),
  };
}

function toThread(row: ThreadRow, guest: GuestIdentity): Thread {
  return {
    ...toSummary(row, guest),
    sourceUrl: row.sourceUrl,
    note: row.note,
    content: row.content,
    summary: row.summary,
    keyPoints: row.keyPoints,
    suggestedQuestions: row.suggestedQuestions,
  };
}

/** Saves pasted text. There is no pipeline yet (Phase 3), so the thread is ready at once. */
export async function createTextThread(
  deps: Deps,
  guest: GuestIdentity,
  input: CreateThreadInput,
): Promise<Thread> {
  const row = await insertThread(deps.db, {
    creatorKey: guest.key,
    creatorName: guest.name,
    sourceType: 'text',
    title: input.title,
    content: input.content,
    status: 'ready',
  });
  return toThread(row, guest);
}

export async function listThreads(
  deps: Deps,
  guest: GuestIdentity,
  query: { cursor?: string; limit: number },
): Promise<ThreadList> {
  const after = query.cursor ? decodeCursor(query.cursor) : undefined;
  // One extra row tells us whether another page exists without a COUNT query.
  const rows = await listThreadSummaries(deps.db, { after, limit: query.limit + 1 });
  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  const hasMore = rows.length > query.limit;
  return {
    items: items.map((row) => toSummary(row, guest)),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}

export async function getThread(deps: Deps, guest: GuestIdentity, id: string): Promise<Thread> {
  const row = await findThreadById(deps.db, id);
  if (!row) throw new NotFoundError('Thread not found');
  return toThread(row, guest);
}

/** Only the browser that created a thread may delete it. */
export async function deleteThread(deps: Deps, guest: GuestIdentity, id: string): Promise<void> {
  const creatorKey = await findThreadCreatorKey(deps.db, id);
  if (creatorKey === undefined) throw new NotFoundError('Thread not found');
  if (creatorKey !== guest.key) {
    throw new ForbiddenError('Only the browser that saved this thread can delete it');
  }
  await deleteThreadById(deps.db, id);
}
