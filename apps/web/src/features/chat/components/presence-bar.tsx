import type { PresenceUser } from '@repo/shared';
import { GuestAvatar } from '@/features/guest/components/guest-avatar';

const SHOWN = 3;

/** Who is in this thread right now: up to three avatars, then a count. */
export function PresenceBar({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) return null;
  const shown = users.slice(0, SHOWN);
  const extra = users.length - shown.length;
  return (
    <div
      className="text-muted-foreground flex items-center gap-3 text-sm"
      aria-label={`${users.length} here now`}
    >
      <div className="flex -space-x-2">
        {shown.map((user) => (
          <GuestAvatar
            key={user.presenceId}
            name={user.name}
            className="ring-background size-7 ring-2"
          />
        ))}
        {extra > 0 && (
          <span className="bg-muted text-muted-foreground ring-background flex size-7 items-center justify-center rounded-full text-xs ring-2">
            +{extra}
          </span>
        )}
      </div>
      <span>{users.length} here now</span>
    </div>
  );
}
