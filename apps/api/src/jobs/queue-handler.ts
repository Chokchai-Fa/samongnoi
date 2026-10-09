import { createDeps } from '../middleware/deps';
import { failThread, SUMMARY_FAILED_MESSAGE, summarizeThread } from '../services/summarize.service';
import type { Deps } from '../types/deps';
import { jobMessageSchema } from './messages';

/** First try plus the retries in wrangler.toml (`max_retries = 3`). */
export const MAX_ATTEMPTS = 4;
const RETRY_BASE_SECONDS = 10;

/**
 * Workers `queue()` consumer. Validates each message, dispatches by `type` to a service, and
 * acks or retries. Handlers must be idempotent: Cloudflare redelivers messages on retry.
 * `makeDeps` is injectable so the retry rules can be tested with fakes.
 */
export function createQueueHandler(makeDeps: (env: Env) => Deps) {
  return async function handleQueue(batch: MessageBatch, env: Env, _ctx: ExecutionContext) {
    const deps = makeDeps(env);
    for (const message of batch.messages) {
      const parsed = jobMessageSchema.safeParse(message.body);
      if (!parsed.success) {
        // Poison message: retrying won't fix it. Log the id only and drop it.
        console.error('Invalid queue message dropped', { id: message.id });
        message.ack();
        continue;
      }

      const job = parsed.data;
      switch (job.type) {
        case 'ping':
          console.log('ping job received', { sentAt: job.sentAt });
          message.ack();
          break;
        case 'summarize-thread':
          await runSummary(deps, job.threadId, message);
          break;
      }
    }
  };
}

/** Acks on success. Retries with backoff while attempts remain; then marks the thread failed. */
async function runSummary(deps: Deps, threadId: string, message: Message) {
  try {
    await summarizeThread(deps, threadId);
    message.ack();
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown';
    if (message.attempts >= MAX_ATTEMPTS) {
      console.error('Summary gave up', { threadId, attempts: message.attempts, error: name });
      await failThread(deps, threadId, SUMMARY_FAILED_MESSAGE);
      message.ack();
    } else {
      console.warn('Summary will retry', { threadId, attempts: message.attempts, error: name });
      message.retry({ delaySeconds: RETRY_BASE_SECONDS * 2 ** (message.attempts - 1) });
    }
  }
}

export const handleQueue = createQueueHandler(createDeps);
