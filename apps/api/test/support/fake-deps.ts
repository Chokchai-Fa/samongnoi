import { vi } from 'vitest';
import type { Cache } from '../../src/lib/cache';
import type { Config } from '../../src/env';
import type { Db } from '../../src/db/client';
import type { Summary } from '../../src/lib/ai';
import type { FetchedPage } from '../../src/lib/fetch-page';
import type { JobMessage } from '../../src/jobs/messages';
import type { Deps } from '../../src/types/deps';

export const summary: Summary = {
  title: 'AI title',
  summary: 'A short summary.',
  keyPoints: ['First point', 'Second point', 'Third point'],
  suggestedQuestions: ['Question one?', 'Question two?', 'Question three?'],
};

export const htmlPage = (body: string) =>
  `<!doctype html><html><head><title>Page</title></head><body>${body}</body></html>`;

/**
 * Fake `deps` for services. The repository is replaced separately with vi.mock, so `db` is never
 * touched; `ai`, `fetchPage` and the queue are plain fakes that record their calls.
 */
export function makeFakeDeps(
  options: {
    page?: (url: string) => Promise<FetchedPage>;
    summarize?: () => Promise<Summary>;
    failEnqueue?: boolean;
  } = {},
) {
  const enqueued: JobMessage[] = [];
  const fetchPage = vi.fn(
    options.page ??
      (async (url: string): Promise<FetchedPage> => ({ url, kind: 'text', body: 'Plain body' })),
  );
  const summarize = vi.fn(options.summarize ?? (async () => summary));
  const enqueue = vi.fn(async (message: JobMessage) => {
    if (options.failEnqueue) throw new Error('queue unavailable');
    enqueued.push(message);
  });

  const deps = {
    config: {} as Config,
    db: {} as Db,
    cache: {} as Cache,
    queue: { enqueue },
    ai: { summarize },
    fetchPage,
  } as unknown as Deps;

  return { deps, enqueued, enqueue, fetchPage, summarize };
}
