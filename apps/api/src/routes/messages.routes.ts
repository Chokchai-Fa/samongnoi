import { createMessageSchema, listMessagesQuerySchema, threadIdParamSchema } from '@repo/shared';
import { Hono } from 'hono';
import { validate } from '../lib/validate';
import { guestMiddleware } from '../middleware/guest';
import { listMessages, postQuestion } from '../services/chat.service';
import type { AppEnv } from '../types/app';

export const messagesRoutes = new Hono<AppEnv>()
  .get(
    '/:id/messages',
    guestMiddleware,
    validate('param', threadIdParamSchema),
    validate('query', listMessagesQuerySchema),
    async (c) => {
      const page = await listMessages(
        c.var.deps,
        c.var.guest,
        c.req.valid('param').id,
        c.req.valid('query'),
      );
      return c.json(page);
    },
  )
  .post(
    '/:id/messages',
    guestMiddleware,
    validate('param', threadIdParamSchema),
    validate('json', createMessageSchema),
    async (c) => {
      // Returns at once: the answer arrives over the thread's WebSocket.
      const result = await postQuestion(
        c.var.deps,
        c.var.guest,
        c.req.valid('param').id,
        c.req.valid('json').content,
      );
      return c.json(result, 202);
    },
  );
