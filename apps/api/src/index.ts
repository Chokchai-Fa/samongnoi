import app from './app';
import { handleQueue } from './jobs/queue-handler';

export default {
  fetch: app.fetch,
  queue: handleQueue,
} satisfies ExportedHandler<Env>;
