import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { writeLocalWranglerConfig } from './scripts/local-wrangler-config.mjs';

// Tests run on the local config (no AI binding); see scripts/local-wrangler-config.mjs.
const localConfig = writeLocalWranglerConfig();

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: localConfig },
      // No test calls a real model (the AI client is always a fake), so nothing goes remote.
      remoteBindings: false,
      miniflare: {
        // Fake values so config validation passes; tests must not reach real services.
        bindings: {
          APP_ENV: 'test',
          APP_URL: 'http://localhost:5173',
          DATABASE_URL: 'postgres://test:test@db.localtest.me:5432/test',
          UPSTASH_REDIS_REST_URL: 'http://localhost:8079',
          UPSTASH_REDIS_REST_TOKEN: 'test-token',
          GEMINI_API_KEY: 'test-gemini-key',
        },
      },
    }),
  ],
});
