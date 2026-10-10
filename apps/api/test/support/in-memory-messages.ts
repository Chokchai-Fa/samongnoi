// In-memory stand-in for `repositories/messages.repository.ts` (see in-memory-threads.ts).
import type {
  MessageRow,
  MessageUpdate,
  NewMessageRow,
  MessagePageCursor,
} from '../../src/repositories/messages.repository';

const BASE = Date.now();
let rows: MessageRow[] = [];
let tick = 0;

export function resetMessages() {
  rows = [];
  tick = 0;
}

export async function insertMessage(_db: unknown, values: NewMessageRow): Promise<MessageRow> {
  tick += 1;
  const row: MessageRow = {
    id: crypto.randomUUID(),
    threadId: values.threadId,
    role: values.role,
    authorKey: values.authorKey ?? null,
    authorName: values.authorName ?? null,
    content: values.content ?? '',
    status: values.status ?? 'complete',
    error: values.error ?? null,
    createdAt: values.createdAt ?? new Date(BASE + tick * 1000),
  };
  rows.push(row);
  return row;
}

export async function updateMessage(
  _db: unknown,
  id: string,
  values: MessageUpdate,
): Promise<MessageRow | undefined> {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) return undefined;
  Object.assign(row, values);
  return row;
}

export async function listMessagesPage(
  _db: unknown,
  { threadId, before, limit }: { threadId: string; before?: MessagePageCursor; limit: number },
): Promise<MessageRow[]> {
  return rows
    .filter((row) => row.threadId === threadId)
    .filter(
      (row) =>
        !before ||
        row.createdAt.getTime() < before.createdAt.getTime() ||
        (row.createdAt.getTime() === before.createdAt.getTime() && row.id < before.id),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
    .slice(0, limit);
}
