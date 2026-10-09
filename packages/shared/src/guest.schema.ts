import { z } from 'zod';

/** Guest identity headers, sent on every API request. Convenience, not security (docs/PRODUCT.md). */
export const GUEST_ID_HEADER = 'X-Client-Id';
/** URL-encoded on the wire: HTTP header values must be ASCII, and display names can be Thai. */
export const GUEST_NAME_HEADER = 'X-Client-Name';

export const GUEST_NAME_MAX = 32;

/** Display name: 1–32 characters after trimming. */
export const guestNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(GUEST_NAME_MAX, `Keep the name to ${GUEST_NAME_MAX} characters or fewer`);

/** The decoded guest identity: what the web stores and what the API reads from the headers. */
export const guestIdentitySchema = z.object({
  clientId: z.uuidv4(),
  clientName: guestNameSchema,
});

export type GuestIdentityInput = z.infer<typeof guestIdentitySchema>;
