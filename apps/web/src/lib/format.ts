const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const steps: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

/** "5 minutes ago", "yesterday" — for list and thread metadata. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
