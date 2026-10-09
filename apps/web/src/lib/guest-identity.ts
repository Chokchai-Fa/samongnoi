import { guestIdentitySchema, type GuestIdentityInput } from '@repo/shared';

// Guest identity lives in this browser only: a random clientId and an editable display name.
// It decides display names and who may delete a thread. It is not a login (docs/PRODUCT.md).
const STORAGE_KEY = 'samongnoi.guest';

let current: GuestIdentityInput | undefined;
const listeners = new Set<() => void>();

function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID needs a secure context, so plain-http previews on a LAN fall back to this.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readStored(): GuestIdentityInput | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = guestIdentitySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    // Storage blocked or corrupt JSON: start a fresh identity instead of failing the page.
    return undefined;
  }
}

function persist(guest: GuestIdentityInput) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
  } catch {
    // Private mode: the identity still works for this page load.
  }
}

function createGuest(): GuestIdentityInput {
  return {
    clientId: randomUuid(),
    clientName: `Guest ${1000 + Math.floor(Math.random() * 9000)}`,
  };
}

/** The current guest, created and saved on first use. Stable between calls until renamed. */
export function getGuest(): GuestIdentityInput {
  if (!current) {
    const stored = readStored();
    current = stored ?? createGuest();
    if (!stored) persist(current);
  }
  return current;
}

/** Saves a new display name. Callers validate it with `guestNameSchema` first. */
export function renameGuest(clientName: string) {
  current = { ...getGuest(), clientName };
  persist(current);
  listeners.forEach((listener) => listener());
}

export function subscribeGuest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
