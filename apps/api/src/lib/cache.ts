import { Redis } from '@upstash/redis/cloudflare';

export type Cache = Redis;

export function createCache(url: string, token: string): Cache {
  return new Redis({ url, token });
}

/** Cache writes must always expire — keeps us under the 256 MB free limit. */
export async function setWithTtl(cache: Cache, key: string, value: unknown, ttlSeconds: number) {
  await cache.set(key, value, { ex: ttlSeconds });
}
