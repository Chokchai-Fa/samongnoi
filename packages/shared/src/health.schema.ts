import { z } from 'zod';

/** Response of `GET /api/health`. */
export const healthResponseSchema = z.object({
  ok: z.literal(true),
  env: z.string(),
  time: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
