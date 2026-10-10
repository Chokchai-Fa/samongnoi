import { vi } from 'vitest';
import type { Cache } from '../../src/lib/cache';
import type { Config } from '../../src/env';
import type { Db } from '../../src/db/client';
import type { ChatPrompt, Summary } from '../../src/lib/ai';
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

/** Streams the given chunks; with `fail`, throws after the last one (or at once when there are none). */
async function* streamChunks(chunks: string[], fail: boolean): AsyncGenerator<string> {
  for (const chunk of chunks) yield chunk;
  if (fail) throw new Error('model unavailable');
}

/**
 * Fake `deps` for services. The repositories are replaced separately with vi.mock, so `db` is
 * never touched. The AI, the page fetcher, the queue and the room are plain fakes that record
 * their calls.
 */
export function makeFakeDeps(
  options: {
    page?: (url: string) => Promise<FetchedPage>;
    summarize?: () => Promise<Summary>;
    failEnqueue?: boolean;
    chunks?: string[];
    chatFails?: boolean;
  } = {},
) {
  const enqueued: JobMessage[] = [];
  const fetchPage = vi.fn(
    options.page ??
      (async (url: string): Promise<FetchedPage> => ({ url, kind: 'text', body: 'Plain body' })),
  );
  const summarize = vi.fn(options.summarize ?? (async () => summary));
  const chat = vi.fn((_input: { primary: ChatPrompt; fallback: ChatPrompt }) =>
    streamChunks(options.chunks ?? ['Hello', ' there'], options.chatFails ?? false),
  );
  const enqueue = vi.fn(async (message: JobMessage) => {
    if (options.failEnqueue) throw new Error('queue unavailable');
    enqueued.push(message);
  });
  const rooms = {
    ask: vi.fn(async () => {}),
    notify: vi.fn(async () => {}),
    connect: vi.fn(async () => new Response(null, { status: 501 })),
  };

  const deps = {
    config: {} as Config,
    db: {} as Db,
    cache: {} as Cache,
    queue: { enqueue },
    ai: { summarize, chat },
    fetchPage,
    rooms,
  } as unknown as Deps;

  return { deps, enqueued, enqueue, fetchPage, summarize, chat, rooms };
}
