import { createThreadSchema, listThreadsQuerySchema, threadIdParamSchema } from '@repo/shared';
import { Hono } from 'hono';
import { validate } from '../lib/validate';
import { guestMiddleware } from '../middleware/guest';
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  retryThread,
} from '../services/threads.service';
import type { AppEnv } from '../types/app';

// Guest identity is applied per route, not with `.use()`: a router-level middleware would also run
// for the WebSocket upgrade under /threads, which browsers cannot send guest headers on.
export const threadsRoutes = new Hono<AppEnv>()
  .get('/', guestMiddleware, validate('query', listThreadsQuerySchema), async (c) => {
    const page = await listThreads(c.var.deps, c.var.guest, c.req.valid('query'));
    return c.json(page);
  })
  .post('/', guestMiddleware, validate('json', createThreadSchema), async (c) => {
    const thread = await createThread(c.var.deps, c.var.guest, c.req.valid('json'));
    return c.json(thread, 202);
  })
  .get('/:id', guestMiddleware, validate('param', threadIdParamSchema), async (c) => {
    const thread = await getThread(c.var.deps, c.var.guest, c.req.valid('param').id);
    return c.json(thread);
  })
  .post('/:id/retry', guestMiddleware, validate('param', threadIdParamSchema), async (c) => {
    const thread = await retryThread(c.var.deps, c.var.guest, c.req.valid('param').id);
    return c.json(thread, 202);
  })
  .delete('/:id', guestMiddleware, validate('param', threadIdParamSchema), async (c) => {
    await deleteThread(c.var.deps, c.var.guest, c.req.valid('param').id);
    return c.body(null, 204);
  });
