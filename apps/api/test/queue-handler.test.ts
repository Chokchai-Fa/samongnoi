import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueueHandler, MAX_ATTEMPTS } from '../src/jobs/queue-handler';
import worker from '../src/index';
import { findThreadById } from '../src/repositories/threads.repository';
import { createThread } from '../src/services/threads.service';
import { makeFakeDeps } from './support/fake-deps';
import { resetThreads } from './support/in-memory-threads';

vi.mock('../src/repositories/threads.repository', () => import('./support/in-memory-threads'));

beforeEach(() => resetThreads());

const alice = { key: 'hash-alice', name: 'Alice' };

it('acks valid and invalid messages', async () => {
  const batch = createMessageBatch('samongnoi-jobs', [
    {
      id: 'valid',
      timestamp: new Date(),
      attempts: 1,
      body: { type: 'ping', sentAt: new Date().toISOString() },
    },
    { id: 'invalid', timestamp: new Date(), attempts: 1, body: { type: 'unknown' } },
  ]);
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  const result = await getQueueResult(batch, ctx);
  expect(result.explicitAcks.sort()).toEqual(['invalid', 'valid']);
  expect(result.retryMessages).toEqual([]);
});

it('acks a summary job whose thread no longer exists', async () => {
  const batch = createMessageBatch('samongnoi-jobs', [
    {
      id: 'gone',
      timestamp: new Date(),
      attempts: 1,
      body: { type: 'summarize-thread', threadId: crypto.randomUUID() },
    },
  ]);
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  const result = await getQueueResult(batch, ctx);
  expect(result.explicitAcks).toEqual(['gone']);
  expect(result.retryMessages).toEqual([]);
});

describe('summary jobs', () => {
  async function pendingText() {
    const { deps } = makeFakeDeps({
      summarize: async () => {
        throw new Error('AI provider unavailable');
      },
    });
    const thread = await createThread(deps, alice, {
      type: 'text',
      title: 'Notes',
      content: 'Text',
    });
    return { deps, thread };
  }

  function job(id: string, threadId: string, attempts: number) {
    return createMessageBatch('samongnoi-jobs', [
      { id, timestamp: new Date(), attempts, body: { type: 'summarize-thread', threadId } },
    ]);
  }

  it('retries with backoff while attempts remain', async () => {
    const { deps, thread } = await pendingText();
    const handler = createQueueHandler(() => deps);
    const batch = job('first-try', thread.id, 1);
    const ctx = createExecutionContext();

    await handler(batch, env, ctx);

    const result = await getQueueResult(batch, ctx);
    expect(result.retryMessages).toEqual([{ msgId: 'first-try' }]);
    expect(result.explicitAcks).toEqual([]);
    expect(await findThreadById(deps.db, thread.id)).toMatchObject({ status: 'processing' });
  });

  it('gives up on the last attempt: the thread is marked failed (Retry offered) and the job acked', async () => {
    const { deps, thread } = await pendingText();
    const handler = createQueueHandler(() => deps);
    const batch = job('last-try', thread.id, MAX_ATTEMPTS);
    const ctx = createExecutionContext();

    await handler(batch, env, ctx);

    const result = await getQueueResult(batch, ctx);
    expect(result.explicitAcks).toEqual(['last-try']);
    expect(result.retryMessages).toEqual([]);
    expect(await findThreadById(deps.db, thread.id)).toMatchObject({
      status: 'failed',
      error: "Couldn't summarize this. Try again.",
    });
  });
});
