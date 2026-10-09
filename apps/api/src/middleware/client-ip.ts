import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types/app';

/** Exposes the caller's IP as `c.var.ip` for per-IP limits. Cloudflare always sets the header. */
export const clientIpMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set('ip', c.req.header('CF-Connecting-IP') ?? 'unknown');
  await next();
});
