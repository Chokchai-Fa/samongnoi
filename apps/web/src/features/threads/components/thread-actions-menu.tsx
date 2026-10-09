import type { ThreadSummary } from '@repo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { EllipsisVertical, Link2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { scheduleThreadDelete } from '../api/delete-thread';
import { copyThreadLink } from '../lib/copy-thread-link';

interface ThreadActionsMenuProps {
  thread: ThreadSummary;
  /** Runs right after a delete is scheduled, e.g. to leave the thread's page. */
  onDelete?: () => void;
  /** Re-reads the thread and its chat. Phones can also pull the page down to do this. */
  onRefresh?: () => void;
}

/** The ⋯ menu. Always visible (no hover-only actions); delete appears only for the creator. */
export function ThreadActionsMenu({ thread, onDelete, onRefresh }: ThreadActionsMenuProps) {
  const queryClient = useQueryClient();
  const title = thread.title ?? 'Untitled';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={`More actions for ${title}`}
        >
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {onRefresh && (
          <DropdownMenuItem onSelect={onRefresh}>
            <RefreshCw />
            Refresh
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void copyThreadLink(thread.id)}>
          <Link2 />
          Copy link
        </DropdownMenuItem>
        {thread.isMine && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                scheduleThreadDelete(queryClient, thread);
                onDelete?.();
              }}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
