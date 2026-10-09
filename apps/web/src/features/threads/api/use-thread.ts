import { threadSchema } from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { ApiError, toApiError } from '@/lib/api-error';
import { isWorking } from '../lib/status';
import { POLL_INTERVAL_MS, threadKeys } from './use-threads';

/** One thread with its content. Polls while it is being read or summarized. */
export function useThread(id: string) {
  return useQuery({
    queryKey: threadKeys.detail(id),
    queryFn: async () => {
      const res = await api.threads[':id'].$get({ param: { id } });
      if (!res.ok) throw await toApiError(res, "Couldn't open this thread. Try again.");
      return threadSchema.parse(await res.json());
    },
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status < 500) && failureCount < 1,
    refetchInterval: (query) =>
      query.state.data && isWorking(query.state.data.status) ? POLL_INTERVAL_MS : false,
  });
}
