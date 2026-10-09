import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import worker from '../src/index';

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
