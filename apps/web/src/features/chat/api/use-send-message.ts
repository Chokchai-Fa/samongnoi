import { createMessageResponseSchema } from '@repo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { toApiError } from '@/lib/api-error';
import { messageKeys } from '../lib/chat-state';

/** Sends a question. The answer arrives over the socket; the list is re-read to show our own question. */
export function useSendMessage(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await api.threads[':id'].messages.$post({
        param: { id: threadId },
        json: { content },
      });
      if (!res.ok)
        throw await toApiError(res, "Couldn't send. Your question is still here, so try again.");
      return createMessageResponseSchema.parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: messageKeys.list(threadId) }),
  });
}
