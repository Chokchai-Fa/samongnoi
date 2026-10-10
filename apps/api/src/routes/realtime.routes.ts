import { guestNameSchema, REALTIME_CLIENT_PROTOCOL, threadIdParamSchema } from '@repo/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { ForbiddenError, ValidationError } from '../lib/errors';
import { sha256Hex } from '../lib/hash';
import { presenceIdOf } from '../lib/presence';
import { validate } from '../lib/validate';
import { connectToRoom } from '../services/realtime.service';
import type { AppEnv } from '../types/app';

/** Browsers cannot set headers on a WebSocket, so the guest id travels as a subprotocol, not in the URL. */
function clientIdFromProtocols(header: string | undefined): string | undefined {
  const entry = header
    ?.split(',')
    .map((protocol) => protocol.trim())
    .find((protocol) => protocol.startsWith(REALTIME_CLIENT_PROTOCOL));
  const id = entry?.slice(REALTIME_CLIENT_PROTOCOL.length);
  return id && z.uuidv4().safeParse(id).success ? id : undefined;
}

export const realtimeRoutes = new Hono<AppEnv>().get(
  '/:id/ws',
  validate('param', threadIdParamSchema),
  async (c) => {
    // Only pages from our own origin may open a room (blocks other sites from reading it).
    if (c.req.header('Origin') !== c.env.APP_URL) {
      throw new ForbiddenError('Open the app from its own address to connect');
    }
    const clientId = clientIdFromProtocols(c.req.header('Sec-WebSocket-Protocol'));
    if (!clientId) throw new ValidationError('Missing guest identity for the connection');
    const name = guestNameSchema.safeParse(c.req.query('name') ?? '');
    if (!name.success) throw new ValidationError(name.error.issues[0]?.message ?? 'Invalid name');

    const key = await sha256Hex(clientId);
    return connectToRoom(
      c.var.deps,
      { threadId: c.req.valid('param').id, presenceId: presenceIdOf(key), name: name.data },
      c.req.raw,
    );
  },
);
