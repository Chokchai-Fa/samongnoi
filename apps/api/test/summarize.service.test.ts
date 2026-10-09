import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PageError } from '../src/lib/fetch-page';
import { summarizeThread } from '../src/services/summarize.service';
import { createThread, deleteThread } from '../src/services/threads.service';
import { findThreadById } from '../src/repositories/threads.repository';
import { htmlPage, makeFakeDeps, summary } from './support/fake-deps';
import { resetThreads } from './support/in-memory-threads';

vi.mock('../src/repositories/threads.repository', () => import('./support/in-memory-threads'));

const alice = { key: 'hash-alice', name: 'Alice' };
const link = { type: 'url' as const, url: 'https://example.com/story' };

const article = htmlPage(`
  <head><meta property="og:site_name" content="Example News"></head>
  <nav>Menu</nav>
  <article><h1>Heading</h1><p>The actual story text.</p></article>`);

beforeEach(() => resetThreads());

describe('summarizeThread', () => {
  it('fetches, extracts, summarizes and marks a link thread ready', async () => {
    const { deps, fetchPage, summarize } = makeFakeDeps({
      page: async (url) => ({ url, kind: 'html', body: article }),
    });
    const thread = await createThread(deps, alice, link);

    await summarizeThread(deps, thread.id);

    const row = await findThreadById(deps.db, thread.id);
    expect(row).toMatchObject({
      status: 'ready',
      error: null,
      // The page's own <title> wins over the AI's title.
      title: 'Page',
      siteName: 'Example News',
      summary: summary.summary,
      keyPoints: summary.keyPoints,
      suggestedQuestions: summary.suggestedQuestions,
    });
    expect(row?.content).toContain('The actual story text.');
    expect(row?.content).not.toContain('Menu');
    expect(fetchPage).toHaveBeenCalledWith('https://example.com/story');
    expect(summarize).toHaveBeenCalledTimes(1);
  });

  it('summarizes a pasted text thread without fetching anything, keeping the user title', async () => {
    const { deps, fetchPage, summarize } = makeFakeDeps();
    const thread = await createThread(deps, alice, {
      type: 'text',
      title: 'My notes',
      content: 'Some text',
    });

    await summarizeThread(deps, thread.id);

    const row = await findThreadById(deps.db, thread.id);
    expect(row).toMatchObject({ status: 'ready', title: 'My notes', content: 'Some text' });
    expect(fetchPage).not.toHaveBeenCalled();
    expect(summarize).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My notes', content: 'Some text' }),
    );
  });

  it('uses the AI title when the page has none', async () => {
    const { deps } = makeFakeDeps({
      page: async (url) => ({ url, kind: 'html', body: '<body><p>Only a paragraph.</p></body>' }),
    });
    const thread = await createThread(deps, alice, link);

    await summarizeThread(deps, thread.id);

    expect((await findThreadById(deps.db, thread.id))?.title).toBe(summary.title);
  });

  it('is idempotent: a ready thread is not fetched or summarized again', async () => {
    const { deps, fetchPage, summarize } = makeFakeDeps({
      page: async (url) => ({ url, kind: 'html', body: article }),
    });
    const thread = await createThread(deps, alice, link);

    await summarizeThread(deps, thread.id);
    await summarizeThread(deps, thread.id);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(summarize).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the thread was deleted before its job ran', async () => {
    const { deps, fetchPage, summarize } = makeFakeDeps({
      page: async (url) => ({ url, kind: 'html', body: article }),
    });
    const thread = await createThread(deps, alice, link);
    await deleteThread(deps, alice, thread.id);

    await expect(summarizeThread(deps, thread.id)).resolves.toBeUndefined();
    expect(fetchPage).not.toHaveBeenCalled();
    expect(summarize).not.toHaveBeenCalled();
  });

  it('records a page problem as a failed thread instead of throwing', async () => {
    const { deps, summarize } = makeFakeDeps({
      page: async () => {
        throw new PageError('Page too large');
      },
    });
    const thread = await createThread(deps, alice, link);

    await expect(summarizeThread(deps, thread.id)).resolves.toBeUndefined();

    const row = await findThreadById(deps.db, thread.id);
    expect(row).toMatchObject({ status: 'failed', error: 'Page too large' });
    expect(summarize).not.toHaveBeenCalled();
  });

  it('fails a page with no readable text', async () => {
    const { deps } = makeFakeDeps({
      page: async (url) => ({ url, kind: 'html', body: htmlPage('<nav>Menu only</nav>') }),
    });
    const thread = await createThread(deps, alice, link);

    await summarizeThread(deps, thread.id);

    expect((await findThreadById(deps.db, thread.id))?.error).toBe(
      "Couldn't find readable text on this page",
    );
  });

  it('lets AI failures throw, so the queue retries, and does not fetch the page again', async () => {
    let calls = 0;
    const { deps, fetchPage } = makeFakeDeps({
      page: async (url) => ({ url, kind: 'html', body: article }),
      summarize: async () => {
        calls += 1;
        if (calls === 1) throw new Error('rate limited');
        return summary;
      },
    });
    const thread = await createThread(deps, alice, link);

    await expect(summarizeThread(deps, thread.id)).rejects.toThrow('rate limited');
    // Still in flight, with the extracted text already saved.
    expect(await findThreadById(deps.db, thread.id)).toMatchObject({ status: 'processing' });

    await summarizeThread(deps, thread.id);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(await findThreadById(deps.db, thread.id)).toMatchObject({ status: 'ready' });
  });
});
