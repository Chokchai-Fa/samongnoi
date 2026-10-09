import { createMiddleware } from 'hono/factory';
import { createDb, type Db } from '../db/client';
import { parseConfig, type Config } from '../env';
import { createAi, type AiClient } from '../lib/ai';
import { createCache, type Cache } from '../lib/cache';
import { fetchPage } from '../lib/fetch-page';
import { createJobQueue } from '../lib/queue';
import { createRooms } from '../lib/rooms';
import type { AppEnv } from '../types/app';
import type { Deps } from '../types/deps';

/**
 * Builds `deps` once per request. Everything is lazy: config is validated and clients are
 * created only when first used, so routes like /api/health stay cheap.
 */
export function createDeps(env: Env): Deps {
  let config: Config | undefined;
  let db: Db | undefined;
  let cache: Cache | undefined;
  let ai: AiClient | undefined;
  const getConfig = () => (config ??= parseConfig(env));

  return {
    get config() {
      return getConfig();
    },
    get db() {
      return (db ??= createDb(getConfig().DATABASE_URL));
    },
    get cache() {
      const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = getConfig();
      return (cache ??= createCache(UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN));
    },
    get ai() {
      return (ai ??= createAi(getConfig(), env.AI));
    },
    fetchPage: (url) => fetchPage(url),
    queue: createJobQueue(env.JOBS_QUEUE),
    rooms: createRooms(env.THREAD_ROOM),
  };
}

export const depsMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set('deps', createDeps(c.env));
  await next();
});
