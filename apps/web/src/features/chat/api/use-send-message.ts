import { createMessageResponseSchema } from '@repo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGuest } from '@/features/guest/hooks/use-guest';
import { api } from '@/lib/api-client';
import { toApiError } from '@/lib/api-error';
import { applyMessageEvent, messageKeys, type MessagePages } from '../lib/chat-state';

/**
 * Sends a question. It appears at once, from the id the server returns; the answer arrives over
 * the socket. No re-read of the list here: a re-read can land after the live events and wipe them.
 */
export function useSendMessage(threadId: string) {
  const queryClient = useQueryClient();
  const guest = useGuest();
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
    onSuccess: ({ messageId }, content) => {
      // The room sends the same message with the server's timestamp; that event replaces this one.
      queryClient.setQueryData<MessagePages>(messageKeys.list(threadId), (data) =>
        applyMessageEvent(data, {
          type: 'message.created',
          message: {
            id: messageId,
            role: 'user',
            authorName: guest.clientName,
            isMine: true,
            content,
            status: 'complete',
            error: null,
            createdAt: new Date().toISOString(),
          },
        }),
      );
    },
  });
}
