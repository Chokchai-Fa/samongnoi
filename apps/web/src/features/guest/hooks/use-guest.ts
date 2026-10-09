import { useSyncExternalStore } from 'react';
import { getGuest, subscribeGuest } from '@/lib/guest-identity';

/** This browser's guest identity. Re-renders when the display name changes. */
export function useGuest() {
  return useSyncExternalStore(subscribeGuest, getGuest, getGuest);
}
