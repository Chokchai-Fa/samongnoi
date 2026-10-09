import { threadSchema, type CreateThreadInput } from '@repo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { toApiError } from '@/lib/api-error';
import { threadKeys } from './use-threads';

export function useCreateThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateThreadInput) => {
      const res = await api.threads.$post({ json: input });
      if (!res.ok) {
        throw await toApiError(res, "Couldn't save this. Your text is still here — try again.");
      }
      return threadSchema.parse(await res.json());
    },
    onSuccess: (thread) => {
      queryClient.setQueryData(threadKeys.detail(thread.id), thread);
      void queryClient.invalidateQueries({ queryKey: threadKeys.lists });
    },
  });
}
