import type { Db } from '../db/client';
import type { Config } from '../env';
import type { AiClient } from '../lib/ai';
import type { Cache } from '../lib/cache';
import type { PageFetcher } from '../lib/fetch-page';
import type { JobQueue } from '../lib/queue';
import type { RoomClient } from '../lib/rooms';

/** Everything services need, passed explicitly as their first argument. */
export interface Deps {
  config: Config;
  db: Db;
  cache: Cache;
  queue: JobQueue;
  ai: AiClient;
  fetchPage: PageFetcher;
  rooms: RoomClient;
}
