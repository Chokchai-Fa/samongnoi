import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { threads, type ThreadRow } from '../db/schema';

export type { ThreadRow };
export type NewThreadRow = typeof threads.$inferInsert;

/** Everything except the large text and AI fields — what list pages read. */
const summaryColumns = {
  id: threads.id,
  creatorKey: threads.creatorKey,
  creatorName: threads.creatorName,
  sourceType: threads.sourceType,
  status: threads.status,
  title: threads.title,
  siteName: threads.siteName,
  imageUrl: threads.imageUrl,
  error: threads.error,
  createdAt: threads.createdAt,
};

export type ThreadSummaryRow = Pick<ThreadRow, keyof typeof summaryColumns>;

export async function insertThread(db: Db, values: NewThreadRow): Promise<ThreadRow> {
  const [row] = await db.insert(threads).values(values).returning();
  if (!row) throw new Error('Insert returned no row');
  return row;
}

export async function findThreadById(db: Db, id: string): Promise<ThreadRow | undefined> {
  const [row] = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
  return row;
}

export async function findThreadCreatorKey(db: Db, id: string): Promise<string | undefined> {
  const [row] = await db
    .select({ creatorKey: threads.creatorKey })
    .from(threads)
    .where(eq(threads.id, id))
    .limit(1);
  return row?.creatorKey;
}

/** One newest-first page, after `after` if given. Pass `limit + 1` to detect a next page. */
export async function listThreadSummaries(
  db: Db,
  { after, limit }: { after?: { createdAt: Date; id: string }; limit: number },
): Promise<ThreadSummaryRow[]> {
  // Row comparison matches the (created_at desc, id desc) index; casts keep the params typed.
  const before = after
    ? sql`(${threads.createdAt}, ${threads.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
    : undefined;
  return db
    .select(summaryColumns)
    .from(threads)
    .where(before)
    .orderBy(desc(threads.createdAt), desc(threads.id))
    .limit(limit);
}

export async function deleteThreadById(db: Db, id: string): Promise<void> {
  await db.delete(threads).where(eq(threads.id, id));
}
