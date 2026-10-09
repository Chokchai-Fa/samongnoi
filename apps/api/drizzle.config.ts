import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs in Node (locally and in CI), connecting with `pg` over TCP — works for both
// Neon (sslmode=require in the URL) and the local docker Postgres.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
