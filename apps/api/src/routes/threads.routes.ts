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

// Every thread route needs the guest headers (they decide `isMine` and who may delete or retry).
export const threadsRoutes = new Hono<AppEnv>()
  .use(guestMiddleware)
  .get('/', validate('query', listThreadsQuerySchema), async (c) => {
    const page = await listThreads(c.var.deps, c.var.guest, c.req.valid('query'));
    return c.json(page);
  })
  .post('/', validate('json', createThreadSchema), async (c) => {
    const thread = await createThread(c.var.deps, c.var.guest, c.req.valid('json'));
    return c.json(thread, 202);
  })
  .get('/:id', validate('param', threadIdParamSchema), async (c) => {
    const thread = await getThread(c.var.deps, c.var.guest, c.req.valid('param').id);
    return c.json(thread);
  })
  .post('/:id/retry', validate('param', threadIdParamSchema), async (c) => {
    const thread = await retryThread(c.var.deps, c.var.guest, c.req.valid('param').id);
    return c.json(thread, 202);
  })
  .delete('/:id', validate('param', threadIdParamSchema), async (c) => {
    await deleteThread(c.var.deps, c.var.guest, c.req.valid('param').id);
    return c.body(null, 204);
  });
