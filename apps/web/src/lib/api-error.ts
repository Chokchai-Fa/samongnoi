import { errorResponseSchema } from '@repo/shared';

/** A failed API call. `message` is written for people, so it can go straight into a card or toast. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Reads the API's `{ error: { message } }` body. Server messages are written for people; for 5xx
 * or a body that isn't ours (HTML from a proxy, bad JSON) the fallback is used instead.
 */
export async function toApiError(res: Response, fallback: string): Promise<ApiError> {
  let message = fallback;
  if (res.status < 500) {
    try {
      const parsed = errorResponseSchema.safeParse(await res.json());
      if (parsed.success) message = parsed.data.error.message;
    } catch {
      // Not JSON: keep the fallback.
    }
  }
  return new ApiError(res.status, message);
}
