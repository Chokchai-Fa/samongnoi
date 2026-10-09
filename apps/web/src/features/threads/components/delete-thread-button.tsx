import type { ThreadSummary } from '@repo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { scheduleThreadDelete } from '../api/delete-thread';

/** Visible delete for a thread the browser created (the ⋯ menu has it too). Undo is in the toast. */
export function DeleteThreadButton({
  thread,
  onDelete,
}: {
  thread: ThreadSummary;
  onDelete?: () => void;
}) {
  const queryClient = useQueryClient();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      onClick={() => {
        scheduleThreadDelete(queryClient, thread);
        onDelete?.();
      }}
    >
      <Trash2 />
      Delete
    </Button>
  );
}
