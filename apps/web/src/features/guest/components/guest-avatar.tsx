import { cn } from '@/lib/utils';

/** Initials on a neutral circle. The name next to it carries the meaning, so this is decorative. */
export function GuestAvatar({ name, className }: { name: string; className?: string }) {
  const initials = Array.from(name.trim()).slice(0, 2).join('').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-secondary text-secondary-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium',
        className,
      )}
    >
      {initials}
    </span>
  );
}
