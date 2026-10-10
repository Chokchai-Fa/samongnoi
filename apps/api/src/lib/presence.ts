/**
 * The id a socket shows to others. Derived from the stored creator/author key, so it never
 * reveals the raw clientId, and the room can tell "mine" apart without storing raw ids.
 */
export function presenceIdOf(key: string): string {
  return key.slice(0, 16);
}
