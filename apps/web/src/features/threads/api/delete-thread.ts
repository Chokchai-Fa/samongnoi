import type { ThreadList, ThreadSummary } from '@repo/shared';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { toApiError } from '@/lib/api-error';
import { threadKeys } from './use-threads';

/** How long "Undo" stays available before the server delete runs. */
export const UNDO_WINDOW_MS = 5000;

/**
 * Removes the thread from the list at once and shows an undo toast. The server delete runs only
 * when the toast closes, so "Undo" never has to race a request. The timer lives outside React, so
 * the delete still happens after the user navigates away from the thread.
 */
export function scheduleThreadDelete(queryClient: QueryClient, thread: ThreadSummary) {
  queryClient.setQueryData<InfiniteData<ThreadList>>(
    threadKeys.lists,
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.filter((item) => item.id !== thread.id),
        })),
      },
  );

  const timer = setTimeout(() => {
    void commitDelete(queryClient, thread);
  }, UNDO_WINDOW_MS);

  toast(`Deleted “${thread.title ?? 'Untitled'}”`, {
    duration: UNDO_WINDOW_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        clearTimeout(timer);
        // Refetching puts the thread back exactly as the server has it.
        void queryClient.invalidateQueries({ queryKey: threadKeys.lists });
      },
    },
  });
}

async function commitDelete(queryClient: QueryClient, thread: ThreadSummary) {
  try {
    const res = await api.threads[':id'].$delete({ param: { id: thread.id } });
    if (!res.ok) {
      throw await toApiError(res, "Couldn't delete this thread. It's back in your list.");
    }
    queryClient.removeQueries({ queryKey: threadKeys.detail(thread.id) });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Couldn't delete this thread.");
  } finally {
    void queryClient.invalidateQueries({ queryKey: threadKeys.lists });
  }
}
