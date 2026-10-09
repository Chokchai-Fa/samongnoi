import { threadListSchema } from '@repo/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { toApiError } from '@/lib/api-error';

export const threadKeys = {
  lists: ['threads', 'list'] as const,
  detail: (id: string) => ['threads', 'detail', id] as const,
};

/** Every thread, newest first, one cursor page at a time ("Load more"). */
export function useThreads() {
  return useInfiniteQuery({
    queryKey: threadKeys.lists,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await api.threads.$get({ query: pageParam ? { cursor: pageParam } : {} });
      if (!res.ok) {
        throw await toApiError(res, "Couldn't load threads. Check your connection and try again.");
      }
      return threadListSchema.parse(await res.json());
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
