// Applies Drizzle migrations to DATABASE_URL. Runs in CI before every deploy.
// Exits 0 when there are no migrations yet, so deploys work before the first table exists.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

if (!existsSync(new URL('../drizzle/meta/_journal.json', import.meta.url))) {
  console.log('No migrations yet (apps/api/drizzle is empty) — skipping.');
  process.exit(0);
}

const result = spawnSync('drizzle-kit', ['migrate'], { stdio: 'inherit', shell: false });
process.exit(result.status ?? 1);
