import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Local dev: docker compose runs a Neon-compatible HTTP proxy in front of Postgres on :4444,
// reachable through the db.localtest.me hostname (see infra/README.md §5).
const LOCAL_HOST = 'db.localtest.me';

export function createDb(databaseUrl: string) {
  if (new URL(databaseUrl).hostname === LOCAL_HOST) {
    neonConfig.fetchEndpoint = (host) => `http://${host}:4444/sql`;
  }
  return drizzle({ client: neon(databaseUrl), schema });
}

export type Db = ReturnType<typeof createDb>;
