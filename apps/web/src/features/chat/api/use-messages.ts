import { messageListSchema } from '@repo/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { toApiError } from '@/lib/api-error';
import { messageKeys } from '../lib/chat-state';

/** How often to re-read the conversation while the live socket is down. */
export const FALLBACK_POLL_MS = 5000;

/** The conversation, newest page first; "Load earlier" fetches older pages. Polls only while offline. */
export function useMessages(threadId: string, options: { polling: boolean }) {
  return useInfiniteQuery({
    queryKey: messageKeys.list(threadId),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await api.threads[':id'].messages.$get({
        param: { id: threadId },
        query: pageParam ? { cursor: pageParam } : {},
      });
      if (!res.ok) throw await toApiError(res, "Couldn't load the conversation. Try again.");
      return messageListSchema.parse(await res.json());
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: options.polling ? FALLBACK_POLL_MS : false,
  });
}
