// Writes .local-wrangler.toml: wrangler.toml without the [ai] table, used by `pnpm dev` and the
// tests. The Workers AI binding only runs against Cloudflare's servers, even in dev, so a local
// run cannot start with it. Deploys still read wrangler.toml, which keeps the binding.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../wrangler.toml', import.meta.url));
const TARGET = fileURLToPath(new URL('../.local-wrangler.toml', import.meta.url));

export function writeLocalWranglerConfig() {
  const local = readFileSync(SOURCE, 'utf8').replace(/^\[ai\][\s\S]*?(?=^\[)/m, '');
  writeFileSync(
    TARGET,
    `# Generated from wrangler.toml by scripts/local-wrangler-config.mjs. Do not edit.\n${local}`,
  );
  return '.local-wrangler.toml';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(writeLocalWranglerConfig());
}
