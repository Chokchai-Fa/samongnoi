import { threadSchema } from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { ApiError, toApiError } from '@/lib/api-error';
import { threadKeys } from './use-threads';

/** One thread with its content. A missing thread (404) is not retried. */
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
  });
}
