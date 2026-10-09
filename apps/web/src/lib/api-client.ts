import type { AppType } from 'api/app-type';
import { hc } from 'hono/client';

// Typed client for the same-origin API. Use it only inside the query hooks in features/<name>/api.
export const api = hc<AppType>('/').api;
