import { threadSchema } from '@repo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { toApiError } from '@/lib/api-error';
import { threadKeys } from './use-threads';

/** Sends a failed thread back through the summary pipeline. Only its creator sees Retry. */
export function useRetryThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.threads[':id'].retry.$post({ param: { id } });
      if (!res.ok) throw await toApiError(res, "Couldn't retry. Try again in a moment.");
      return threadSchema.parse(await res.json());
    },
    onSuccess: (thread) => {
      queryClient.setQueryData(threadKeys.detail(thread.id), thread);
      void queryClient.invalidateQueries({ queryKey: threadKeys.lists });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
