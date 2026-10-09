import type { HealthResponse } from '@repo/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../types/app';

export const healthRoutes = new Hono<AppEnv>().get('/', (c) => {
  const body: HealthResponse = {
    ok: true,
    env: c.env.APP_ENV,
    time: new Date().toISOString(),
  };
  return c.json(body);
});
