import { type Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import type { ErrorResponse } from '@repo/shared';
import { AppError } from './lib/errors';
import { clientIpMiddleware } from './middleware/client-ip';
import { depsMiddleware } from './middleware/deps';
import { healthRoutes } from './routes/health.routes';
import { messagesRoutes } from './routes/messages.routes';
import { realtimeRoutes } from './routes/realtime.routes';
import { threadsRoutes } from './routes/threads.routes';
import type { AppEnv } from './types/app';

/** The only place AppError codes become HTTP statuses. */
const errorStatus: Record<string, ContentfulStatusCode> = {
  validation_error: 400,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
};

/** Maps errors to HTTP responses. The only place AppError codes become statuses. */
export function handleError(err: Error, c: Context<AppEnv>) {
  if (err instanceof AppError) {
    const status = errorStatus[err.code] ?? 400;
    return c.json<ErrorResponse>({ error: { code: err.code, message: err.message } }, status);
  }
  console.error('Unhandled error', { requestId: c.get('requestId'), error: err });
  return c.json<ErrorResponse>(
    { error: { code: 'internal_error', message: 'Something went wrong' } },
    500,
  );
}

// One chain, so `AppType` carries the full route schema for the RPC client. Add routers with
// `.route()` before `.notFound()`.
const app = new Hono<AppEnv>()
  .basePath('/api')
  .use(requestId())
  .use(logger())
  .use(clientIpMiddleware)
  .use(depsMiddleware)
  .route('/health', healthRoutes)
  .route('/threads', threadsRoutes)
  .route('/threads', messagesRoutes)
  .route('/threads', realtimeRoutes)
  .notFound((c) =>
    c.json<ErrorResponse>({ error: { code: 'not_found', message: 'Route not found' } }, 404),
  )
  .onError(handleError);

export type AppType = typeof app;
export default app;
