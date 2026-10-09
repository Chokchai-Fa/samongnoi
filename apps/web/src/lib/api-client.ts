import { GUEST_ID_HEADER, GUEST_NAME_HEADER } from '@repo/shared';
import type { AppType } from 'api/app-type';
import { hc } from 'hono/client';
import { getGuest } from './guest-identity';

// Typed client for the same-origin API. Every request carries the guest identity headers.
// Use it only inside the query/mutation hooks in features/<name>/api.
export const api = hc<AppType>('/', {
  headers: () => {
    const guest = getGuest();
    return {
      [GUEST_ID_HEADER]: guest.clientId,
      // URL-encoded: header values must be ASCII, and display names can be Thai.
      [GUEST_NAME_HEADER]: encodeURIComponent(guest.clientName),
    };
  },
}).api;
