import { GUEST_ID_HEADER, GUEST_NAME_HEADER, guestIdentitySchema } from '@repo/shared';
import { createMiddleware } from 'hono/factory';
import { ValidationError } from '../lib/errors';
import { sha256Hex } from '../lib/hash';
import type { AppEnv } from '../types/app';

/** Decodes the URL-encoded name header; a malformed escape is treated as a missing header. */
function decodeName(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

/**
 * Reads the guest headers into `c.var.guest`. Raw clientIds are hashed here and never stored,
 * logged, or returned. Mount it on routes that need the caller's identity.
 */
export const guestMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const parsed = guestIdentitySchema.safeParse({
    clientId: c.req.header(GUEST_ID_HEADER),
    clientName: decodeName(c.req.header(GUEST_NAME_HEADER)),
  });
  if (!parsed.success) {
    throw new ValidationError('Missing or invalid guest identity headers');
  }
  c.set('guest', {
    key: await sha256Hex(parsed.data.clientId),
    name: parsed.data.clientName,
  });
  await next();
});
