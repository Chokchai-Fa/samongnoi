import type { ThreadSummary } from '@repo/shared';

type Status = ThreadSummary['status'];
type SourceType = ThreadSummary['sourceType'];

/** A thread the background job has not finished with yet. */
export function isWorking(status: Status): boolean {
  return status === 'pending' || status === 'processing';
}

/** Words for the in-progress state. A link is read first; pasted text goes straight to summary. */
export function workingMessage(sourceType: SourceType, status: Status): string {
  if (status === 'processing') return 'Summarizing…';
  return sourceType === 'url' ? 'Reading the page…' : 'Summarizing…';
}

/** Words for the failed state. The server's message says why (shown beside it). */
export function failedMessage(sourceType: SourceType): string {
  return sourceType === 'url' ? "Couldn't read this page." : "Couldn't summarize this.";
}
