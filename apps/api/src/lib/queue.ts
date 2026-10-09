import { jobMessageSchema, type JobMessage } from '../jobs/messages';

export interface JobQueue {
  enqueue(message: JobMessage): Promise<void>;
}

export function createJobQueue(queue: Queue): JobQueue {
  return {
    async enqueue(message) {
      await queue.send(jobMessageSchema.parse(message));
    },
  };
}
