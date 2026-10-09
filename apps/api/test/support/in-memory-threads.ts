// In-memory stand-in for `repositories/threads.repository.ts`. Tests swap it in with vi.mock, so
// services and routes run without Neon. Same function names and shapes as the real module.
import type {
  NewThreadRow,
  ThreadRow,
  ThreadSummaryRow,
} from '../../src/repositories/threads.repository';

let rows: ThreadRow[] = [];
let tick = 0;

export function resetThreads() {
  rows = [];
  tick = 0;
}

// Each insert is one second later than the last, so ordering is deterministic.
export async function insertThread(_db: unknown, values: NewThreadRow): Promise<ThreadRow> {
  tick += 1;
  const createdAt = new Date(Date.UTC(2026, 9, 1) + tick * 1000);
  const row: ThreadRow = {
    id: crypto.randomUUID(),
    creatorKey: values.creatorKey,
    creatorName: values.creatorName,
    sourceType: values.sourceType,
    sourceUrl: null,
    note: null,
    title: values.title ?? null,
    siteName: null,
    imageUrl: null,
    content: values.content ?? null,
    summary: null,
    keyPoints: null,
    suggestedQuestions: null,
    status: values.status,
    error: null,
    createdAt,
    updatedAt: createdAt,
  };
  rows.push(row);
  return row;
}

export async function findThreadById(_db: unknown, id: string): Promise<ThreadRow | undefined> {
  return rows.find((row) => row.id === id);
}

export async function findThreadCreatorKey(_db: unknown, id: string): Promise<string | undefined> {
  return rows.find((row) => row.id === id)?.creatorKey;
}

export async function listThreadSummaries(
  _db: unknown,
  { after, limit }: { after?: { createdAt: Date; id: string }; limit: number },
): Promise<ThreadSummaryRow[]> {
  const sorted = [...rows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
  );
  const afterCursor = after
    ? sorted.filter(
        (row) =>
          row.createdAt.getTime() < after.createdAt.getTime() ||
          (row.createdAt.getTime() === after.createdAt.getTime() && row.id < after.id),
      )
    : sorted;
  return afterCursor.slice(0, limit).map((row) => ({
    id: row.id,
    creatorKey: row.creatorKey,
    creatorName: row.creatorName,
    sourceType: row.sourceType,
    status: row.status,
    title: row.title,
    siteName: row.siteName,
    imageUrl: row.imageUrl,
    error: row.error,
    createdAt: row.createdAt,
  }));
}

export async function deleteThreadById(_db: unknown, id: string): Promise<void> {
  rows = rows.filter((row) => row.id !== id);
}
