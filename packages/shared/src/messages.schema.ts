import { z } from 'zod';

/** Keeps a question short enough to read in the chat and to fit the prompt budget. */
export const MESSAGE_MAX = 2000;

export const messageRoleSchema = z.enum(['user', 'assistant']);
export const messageStatusSchema = z.enum(['streaming', 'complete', 'failed']);

/** `POST /api/threads/:id/messages` body. */
export const createMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Type a question first')
    .max(MESSAGE_MAX, `Keep questions under ${MESSAGE_MAX} characters`),
});

/** One chat message as the viewer sees it. `isMine` is computed on the server, never a raw id. */
export const messageSchema = z.object({
  id: z.uuid(),
  role: messageRoleSchema,
  authorName: z.string().nullable(),
  isMine: z.boolean(),
  content: z.string(),
  status: messageStatusSchema,
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

/** One page of messages, oldest → newest. `nextCursor` leads to older messages. */
export const messageListSchema = z.object({
  items: z.array(messageSchema),
  nextCursor: z.string().nullable(),
});

export const listMessagesQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createMessageResponseSchema = z.object({
  messageId: z.uuid(),
});

export type Message = z.infer<typeof messageSchema>;
export type MessageList = z.infer<typeof messageListSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
