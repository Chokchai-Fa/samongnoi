import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';
import { ValidationError } from './errors';

/**
 * zod validation for route inputs. Failures go through `app.onError`, so every 400 has the same
 * `{ error: { code, message } }` shape as the rest of the API (zValidator's default body is not).
 */
export function validate<Target extends 'json' | 'query' | 'param', Schema extends ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new ValidationError(result.error.issues[0]?.message ?? 'Invalid request');
    }
  });
}
