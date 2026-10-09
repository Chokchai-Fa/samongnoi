import { z } from 'zod';

/** Validated runtime config. Every secret/var the app reads must be listed here. */
const configSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']),
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  // Primary summarizer (Gemini Flash). Workers AI is the fallback and needs no key.
  GEMINI_API_KEY: z.string().min(1),
});

export type Config = z.infer<typeof configSchema>;

export function parseConfig(env: Env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    // Names only — never log values (they include secrets).
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid or missing config: ${fields}`);
  }
  return result.data;
}
