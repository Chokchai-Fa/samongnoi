import { threadListSchema, type ThreadList } from '@repo/shared';
import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { toApiError } from '@/lib/api-error';
import { isWorking } from '../lib/status';

export const threadKeys = {
  lists: ['threads', 'list'] as const,
  detail: (id: string) => ['threads', 'detail', id] as const,
};

/** How often Home asks for progress while a thread is still being read or summarized. */
export const POLL_INTERVAL_MS = 3000;

export function hasWorkingThreads(data: InfiniteData<ThreadList> | undefined): boolean {
  return data?.pages.some((page) => page.items.some((item) => isWorking(item.status))) ?? false;
}

/** Every thread, newest first, one cursor page at a time ("Load more"). Polls while any is pending. */
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
    refetchInterval: (query) => (hasWorkingThreads(query.state.data) ? POLL_INTERVAL_MS : false),
  });
}
