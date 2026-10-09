import { z } from 'zod';

/** Every queue message type. Add one variant per job; the consumer switches on `type`. */
export const jobMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping'), sentAt: z.iso.datetime() }),
]);

export type JobMessage = z.infer<typeof jobMessageSchema>;
