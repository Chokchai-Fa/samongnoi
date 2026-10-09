import { createThreadSchema, listThreadsQuerySchema, threadIdParamSchema } from '@repo/shared';
import { Hono } from 'hono';
import { validate } from '../lib/validate';
import { guestMiddleware } from '../middleware/guest';
import {
  createTextThread,
  deleteThread,
  getThread,
  listThreads,
} from '../services/threads.service';
import type { AppEnv } from '../types/app';

// Every thread route needs the guest headers (they decide `isMine` and who may delete).
export const threadsRoutes = new Hono<AppEnv>()
  .use(guestMiddleware)
  .get('/', validate('query', listThreadsQuerySchema), async (c) => {
    const page = await listThreads(c.var.deps, c.var.guest, c.req.valid('query'));
    return c.json(page);
  })
  .post('/', validate('json', createThreadSchema), async (c) => {
    const thread = await createTextThread(c.var.deps, c.var.guest, c.req.valid('json'));
    return c.json(thread, 202);
  })
  .get('/:id', validate('param', threadIdParamSchema), async (c) => {
    const thread = await getThread(c.var.deps, c.var.guest, c.req.valid('param').id);
    return c.json(thread);
  })
  .delete('/:id', validate('param', threadIdParamSchema), async (c) => {
    await deleteThread(c.var.deps, c.var.guest, c.req.valid('param').id);
    return c.body(null, 204);
  });
