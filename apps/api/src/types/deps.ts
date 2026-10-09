import type { Db } from '../db/client';
import type { Config } from '../env';
import type { Cache } from '../lib/cache';
import type { JobQueue } from '../lib/queue';

/** Everything services need, passed explicitly as their first argument. */
export interface Deps {
  config: Config;
  db: Db;
  cache: Cache;
  queue: JobQueue;
}
