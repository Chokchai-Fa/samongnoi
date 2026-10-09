/** The caller's guest identity, built from request headers by `middleware/guest.ts`. */
export interface GuestIdentity {
  /** sha256(clientId): the only form of the id that is stored or compared. */
  key: string;
  name: string;
}
