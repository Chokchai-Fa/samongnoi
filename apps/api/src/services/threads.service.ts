import type { CreateThreadInput, Thread, ThreadList, ThreadSummary } from '@repo/shared';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors';
import {
  deleteThreadById,
  findThreadById,
  findThreadCreatorKey,
  insertThread,
  listThreadSummaries,
  updateThread,
  type ThreadRow,
  type ThreadSummaryRow,
} from '../repositories/threads.repository';
import { notifyRoom } from '../lib/rooms';
import type { Deps } from '../types/deps';
import type { GuestIdentity } from '../types/guest';

/** Shown when the job cannot even be queued. The user can Retry from the card. */
const START_FAILED_MESSAGE = "Couldn't start reading this. Try again.";

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

/**
 * Saves a text or link thread as `pending` and queues its summary. Both kinds return 202:
 * the summary arrives later, and the client polls until it is ready.
 */
export async function createThread(
  deps: Deps,
  guest: GuestIdentity,
  input: CreateThreadInput,
): Promise<Thread> {
  const row = await insertThread(
    deps.db,
    input.type === 'text'
      ? {
          creatorKey: guest.key,
          creatorName: guest.name,
          sourceType: 'text',
          title: input.title,
          content: input.content,
          status: 'pending',
        }
      : {
          creatorKey: guest.key,
          creatorName: guest.name,
          sourceType: 'url',
          sourceUrl: input.url,
          note: input.note || null,
          status: 'pending',
        },
  );
  return toThread(await queueSummary(deps, row), guest);
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

/** Only the browser that created a thread may delete it. Its queued job then does nothing. */
export async function deleteThread(deps: Deps, guest: GuestIdentity, id: string): Promise<void> {
  const creatorKey = await findThreadCreatorKey(deps.db, id);
  if (creatorKey === undefined) throw new NotFoundError('Thread not found');
  if (creatorKey !== guest.key) {
    throw new ForbiddenError('Only the browser that saved this thread can delete it');
  }
  await deleteThreadById(deps.db, id);
  await notifyRoom(deps.rooms, id, { type: 'thread.deleted' });
}

/** Sends a failed thread back through the pipeline. Only its creator, and only when it failed. */
export async function retryThread(deps: Deps, guest: GuestIdentity, id: string): Promise<Thread> {
  const row = await findThreadById(deps.db, id);
  if (!row) throw new NotFoundError('Thread not found');
  if (row.creatorKey !== guest.key) {
    throw new ForbiddenError('Only the browser that saved this thread can retry it');
  }
  if (row.status !== 'failed') throw new ConflictError('Only threads that failed can be retried');

  const pending = (await updateThread(deps.db, id, { status: 'pending', error: null })) ?? row;
  return toThread(await queueSummary(deps, pending), guest);
}

/** Hands the thread to the background job. If the queue refuses, the thread fails now. */
async function queueSummary(deps: Deps, row: ThreadRow): Promise<ThreadRow> {
  try {
    await deps.queue.enqueue({ type: 'summarize-thread', threadId: row.id });
    return row;
  } catch (error) {
    console.error('Could not queue summary', {
      threadId: row.id,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return (
      (await updateThread(deps.db, row.id, { status: 'failed', error: START_FAILED_MESSAGE })) ??
      row
    );
  }
}
