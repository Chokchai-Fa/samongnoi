import type { Message } from '@repo/shared';

/**
 * One queued answer, passed from the POST to the thread's room. Messages are already saved;
 * the room only broadcasts them and streams the answer.
 */
export interface AnswerRequest {
  threadId: string;
  question: string;
  askerName: string;
  /** Presence id of the asker (first 16 hex of sha256(clientId)); marks "mine" per socket. */
  authorPresenceId: string;
  userMessage: Message;
  assistantMessage: Message;
}
