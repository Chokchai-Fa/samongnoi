import { extractPage, extractPlainText } from '../lib/extract';
import { PageError } from '../lib/fetch-page';
import { notifyRoom } from '../lib/rooms';
import { findThreadById, updateThread } from '../repositories/threads.repository';
import type { Deps } from '../types/deps';

/** What the user sees when the background job gives up. Retry is offered next to it. */
export const SUMMARY_FAILED_MESSAGE = "Couldn't summarize this. Try again.";

/**
 * Pipeline for one thread: fetch → extract → summarize → save. Idempotent: a deleted or ready
 * thread does nothing, so retried and duplicate messages are harmless. Each stage saves its
 * result, so a retry after an AI error does not fetch the page again.
 *
 * Problems with the page (bad link, too large, wrong type, no text) are permanent for this
 * link: the thread is marked failed and the function returns. Anything else (AI rate limits,
 * outages) throws, and the queue retries the job.
 */
export async function summarizeThread(deps: Deps, threadId: string): Promise<void> {
  const thread = await findThreadById(deps.db, threadId);
  if (!thread || thread.status === 'ready') return;

  await updateThread(deps.db, threadId, { status: 'processing', error: null });

  let content = thread.content;
  let title = thread.title;
  try {
    if (content === null && thread.sourceType === 'url') {
      if (!thread.sourceUrl) throw new PageError('This thread has no link to read');
      const page = await deps.fetchPage(thread.sourceUrl);
      const extracted =
        page.kind === 'html' ? await extractPage(page.body, page.url) : extractPlainText(page.body);
      if (!extracted.text) throw new PageError("Couldn't find readable text on this page");

      content = extracted.text;
      title = title ?? extracted.title;
      await updateThread(deps.db, threadId, {
        content,
        title,
        siteName: extracted.siteName,
        imageUrl: extracted.imageUrl,
      });
    }
  } catch (error) {
    if (error instanceof PageError) {
      await failThread(deps, threadId, error.message);
      return;
    }
    throw error;
  }

  if (content === null) {
    await failThread(deps, threadId, 'There is no text to summarize');
    return;
  }

  const summary = await deps.ai.summarize({
    title,
    sourceUrl: thread.sourceUrl,
    note: thread.note,
    content,
  });

  await updateThread(deps.db, threadId, {
    status: 'ready',
    error: null,
    title: title ?? summary.title,
    summary: summary.summary,
    keyPoints: summary.keyPoints,
    suggestedQuestions: summary.suggestedQuestions,
  });

  await notifyRoom(deps.rooms, threadId, {
    type: 'thread.updated',
    status: 'ready',
    title: title ?? summary.title,
    summary: summary.summary,
  });
}

/** Records a failure the user can act on (Retry). The queue also uses it when retries run out. */
export async function failThread(deps: Deps, threadId: string, message: string): Promise<void> {
  await updateThread(deps.db, threadId, { status: 'failed', error: message });
  await notifyRoom(deps.rooms, threadId, {
    type: 'thread.updated',
    status: 'failed',
    title: null,
    summary: null,
  });
}
