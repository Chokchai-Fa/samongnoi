import { z } from 'zod';

/** JSON body of every non-2xx API response (built only by the API's `app.onError`). */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
