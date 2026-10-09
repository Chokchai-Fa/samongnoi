import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        // Fake values so config validation passes; tests must not reach real services.
        bindings: {
          APP_ENV: 'test',
          APP_URL: 'http://localhost:5173',
          DATABASE_URL: 'postgres://test:test@db.localtest.me:5432/test',
          UPSTASH_REDIS_REST_URL: 'http://localhost:8079',
          UPSTASH_REDIS_REST_TOKEN: 'test-token',
        },
      },
    }),
  ],
});
