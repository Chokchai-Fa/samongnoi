import { setWithTtl } from '../lib/cache';
import type { Deps } from '../types/deps';

export const KEEPALIVE_KEY = 'keepalive';
/** Longer than the cron interval, so the key never piles up but always exists. */
const KEEPALIVE_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Upstash archives a free database after ~30 days without activity (the database is removed and
 * Terraform plans then fail with 404). A daily write keeps it active; a PING may not count.
 */
export async function keepCacheAlive(deps: Deps, now = new Date()): Promise<void> {
  await setWithTtl(deps.cache, KEEPALIVE_KEY, now.toISOString(), KEEPALIVE_TTL_SECONDS);
}
