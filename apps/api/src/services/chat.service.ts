import type { Message, ServerEvent } from '@repo/shared';
import { buildChatPrompt, type HistoryLine } from '../lib/chat-prompt';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { ConflictError, NotFoundError } from '../lib/errors';
import { presenceIdOf } from '../lib/presence';
import {
  insertMessage,
  listMessagesPage,
  updateMessage,
  type MessageRow,
} from '../repositories/messages.repository';
import { findThreadById } from '../repositories/threads.repository';
import type { Deps } from '../types/deps';
import type { GuestIdentity } from '../types/guest';
import type { AnswerRequest } from '../types/chat';

/** How many earlier messages the model sees with each question. */
export const CHAT_HISTORY_SIZE = 10;
/** The source text sent to the fallback model is shorter (Workers AI has a smaller context). */
const FALLBACK_SOURCE_CHARS = 12_000;
/** Partial answers are saved at most this often, so a reload mid-answer shows the progress. */
const SAVE_EVERY_MS = 1500;
/** A "streaming" message older than this lost its job (eviction, deploy): show it as failed. */
const STALE_STREAM_MS = 10 * 60_000;

export const ANSWER_FAILED_MESSAGE = "Couldn't answer this. Ask again in a moment.";
const ANSWER_INTERRUPTED_MESSAGE = 'The answer was interrupted. Ask again.';

export type AnswerEvent = Extract<
  ServerEvent,
  { type: 'message.delta' | 'message.completed' | 'message.failed' }
>;

function toMessage(row: MessageRow, viewerKey: string | undefined, now = Date.now()): Message {
  const stale = row.status === 'streaming' && now - row.createdAt.getTime() > STALE_STREAM_MS;
  return {
    id: row.id,
    role: row.role,
    authorName: row.authorName,
    isMine: viewerKey !== undefined && row.authorKey === viewerKey,
    content: row.content,
    status: stale ? 'failed' : row.status,
    error: stale ? ANSWER_INTERRUPTED_MESSAGE : row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

function notReadyMessage(status: string): string {
  if (status === 'failed')
    return 'This thread did not load, so there is nothing to ask about yet. Retry it first.';
  return 'Still reading this. You can ask once the summary is ready.';
}

/**
 * Saves a question and a placeholder for the answer, then hands both to the thread's room.
 * Returns at once with the question's id: the answer streams in over the socket.
 */
export async function postQuestion(
  deps: Deps,
  guest: GuestIdentity,
  threadId: string,
  content: string,
): Promise<{ messageId: string }> {
  const thread = await findThreadById(deps.db, threadId);
  if (!thread) throw new NotFoundError('Thread not found');
  if (thread.status !== 'ready') throw new ConflictError(notReadyMessage(thread.status));

  const question = await insertMessage(deps.db, {
    threadId,
    role: 'user',
    authorKey: guest.key,
    authorName: guest.name,
    content,
    status: 'complete',
  });
  const answer = await insertMessage(deps.db, {
    threadId,
    role: 'assistant',
    content: '',
    status: 'streaming',
  });

  const job: AnswerRequest = {
    threadId,
    question: content,
    askerName: guest.name,
    authorPresenceId: presenceIdOf(guest.key),
    userMessage: toMessage(question, guest.key),
    assistantMessage: toMessage(answer, guest.key),
  };
  try {
    await deps.rooms.ask(threadId, job);
  } catch (error) {
    console.error('Could not reach the room for an answer', {
      threadId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    await updateMessage(deps.db, answer.id, { status: 'failed', error: ANSWER_FAILED_MESSAGE });
  }
  return { messageId: question.id };
}

/** One page of the conversation, oldest → newest. `cursor` points at the page of older messages. */
export async function listMessages(
  deps: Deps,
  guest: GuestIdentity,
  threadId: string,
  query: { cursor?: string; limit: number },
): Promise<{ items: Message[]; nextCursor: string | null }> {
  const thread = await findThreadById(deps.db, threadId);
  if (!thread) throw new NotFoundError('Thread not found');

  const before = query.cursor ? decodeCursor(query.cursor) : undefined;
  // Newest first from the database; one extra row tells us whether older messages exist.
  const rows = await listMessagesPage(deps.db, { threadId, before, limit: query.limit + 1 });
  const page = rows.slice(0, query.limit);
  const oldest = page.at(-1);
  const hasMore = rows.length > query.limit;
  const now = Date.now();
  return {
    items: [...page].reverse().map((row) => toMessage(row, guest.key, now)),
    nextCursor:
      hasMore && oldest ? encodeCursor({ createdAt: oldest.createdAt, id: oldest.id }) : null,
  };
}

/**
 * Runs one answer inside the thread's room: builds the prompt from the thread and recent
 * conversation, streams the model's text to `emit`, and saves the result. Never throws for a
 * model failure: the message is marked failed and the room is told.
 */
export async function answerQuestion(
  deps: Deps,
  job: AnswerRequest,
  emit: (event: AnswerEvent) => void,
): Promise<void> {
  const { db } = deps;
  const messageId = job.assistantMessage.id;

  const thread = await findThreadById(db, job.threadId);
  // Deleted while queued: the room was told, and the messages went with the thread.
  if (!thread) return;
  if (thread.status !== 'ready') {
    await updateMessage(db, messageId, { status: 'failed', error: ANSWER_FAILED_MESSAGE });
    emit({ type: 'message.failed', messageId, error: ANSWER_FAILED_MESSAGE });
    return;
  }

  // Context = recent complete messages, excluding this question and this answer.
  const recent = await listMessagesPage(db, {
    threadId: job.threadId,
    limit: CHAT_HISTORY_SIZE + 4,
  });
  const history: HistoryLine[] = recent
    .reverse()
    .filter(
      (row) =>
        row.id !== job.userMessage.id &&
        row.id !== messageId &&
        row.status === 'complete' &&
        row.content.length > 0,
    )
    .slice(-CHAT_HISTORY_SIZE)
    .map((row) => ({
      author: row.role === 'assistant' ? 'AI' : (row.authorName ?? 'Guest'),
      content: row.content,
    }));

  const source = { title: thread.title, summary: thread.summary, content: thread.content ?? '' };
  const primary = buildChatPrompt({
    source,
    history,
    question: job.question,
    askerName: job.askerName,
  });
  const fallback = buildChatPrompt({
    source,
    history,
    question: job.question,
    askerName: job.askerName,
    maxSourceChars: FALLBACK_SOURCE_CHARS,
  });

  let answer = '';
  let savedAt = 0;
  try {
    for await (const text of deps.ai.chat({ primary, fallback })) {
      answer += text;
      emit({ type: 'message.delta', messageId, text });
      if (Date.now() - savedAt > SAVE_EVERY_MS) {
        savedAt = Date.now();
        await updateMessage(db, messageId, { content: answer });
      }
    }
    const finalText = answer.trim();
    if (!finalText) throw new Error('The model returned no text');
    await updateMessage(db, messageId, { content: finalText, status: 'complete', error: null });
    emit({ type: 'message.completed', messageId, content: finalText });
  } catch (error) {
    console.error('Answer failed', {
      threadId: job.threadId,
      error: error instanceof Error ? error.name : 'unknown',
    });
    await updateMessage(db, messageId, {
      content: answer,
      status: 'failed',
      error: ANSWER_FAILED_MESSAGE,
    });
    emit({ type: 'message.failed', messageId, error: ANSWER_FAILED_MESSAGE });
  }
}
