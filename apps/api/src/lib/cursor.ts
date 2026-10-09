import { z } from 'zod';
import { ValidationError } from './errors';

// Opaque to clients: base64url(JSON). Validated again on decode, so a tampered cursor is a 400.
const cursorPayloadSchema = z.object({
  t: z.iso.datetime(),
  id: z.uuid(),
});

/** Position of the last item on a page: the list continues strictly after it. */
export interface PageCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(cursor: PageCursor): string {
  const json = JSON.stringify({ t: cursor.createdAt.toISOString(), id: cursor.id });
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCursor(value: string): PageCursor {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const payload = cursorPayloadSchema.parse(JSON.parse(atob(base64)));
    return { createdAt: new Date(payload.t), id: payload.id };
  } catch {
    throw new ValidationError('Invalid cursor');
  }
}
