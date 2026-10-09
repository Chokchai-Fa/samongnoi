import { jobMessageSchema } from './messages';

/**
 * Workers `queue()` consumer. Validates each message, dispatches by `type` to a service, and
 * acks. Handlers must be idempotent — Cloudflare retries failed messages (max_retries).
 */
export async function handleQueue(batch: MessageBatch, _env: Env, _ctx: ExecutionContext) {
  for (const message of batch.messages) {
    const parsed = jobMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      // Poison message: retrying won't fix it. Log the id only and drop it.
      console.error('Invalid queue message dropped', { id: message.id });
      message.ack();
      continue;
    }

    switch (parsed.data.type) {
      case 'ping':
        console.log('ping job received', { sentAt: parsed.data.sentAt });
        break;
    }
    message.ack();
  }
}
