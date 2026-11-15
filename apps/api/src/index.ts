export { ThreadRoom } from './durable-objects/thread-room';
import app from './app';
import { handleQueue } from './jobs/queue-handler';
import { handleScheduled } from './jobs/scheduled-handler';

export default {
  fetch: app.fetch,
  queue: handleQueue,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;
