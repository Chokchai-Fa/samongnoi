import { z } from 'zod';
import { messageSchema } from './messages.schema';
import { threadStatusSchema } from './threads.schema';

/** Subprotocol prefix that carries the guest id on a WebSocket upgrade (browsers can't set headers). */
export const REALTIME_CLIENT_PROTOCOL = 'cid.';
/** The one subprotocol the server agrees to. */
export const REALTIME_PROTOCOL = 'samongnoi';

export const presenceUserSchema = z.object({
  presenceId: z.string(),
  name: z.string(),
});

/** Server → client events. Each socket receives them as JSON text. */
export const serverEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message.created'), message: messageSchema }),
  z.object({ type: z.literal('message.delta'), messageId: z.uuid(), text: z.string() }),
  z.object({ type: z.literal('message.completed'), messageId: z.uuid(), content: z.string() }),
  z.object({ type: z.literal('message.failed'), messageId: z.uuid(), error: z.string() }),
  z.object({ type: z.literal('presence'), users: z.array(presenceUserSchema) }),
  z.object({ type: z.literal('typing'), presenceId: z.string(), name: z.string() }),
  z.object({
    type: z.literal('thread.updated'),
    status: threadStatusSchema,
    title: z.string().nullable(),
    summary: z.string().nullable(),
  }),
  z.object({ type: z.literal('thread.deleted') }),
]);

/** Client → server. Only typing pings travel over the socket; messages are sent over HTTP. */
export const clientEventSchema = z.object({ type: z.literal('typing') });

export type ServerEvent = z.infer<typeof serverEventSchema>;
export type PresenceUser = z.infer<typeof presenceUserSchema>;
