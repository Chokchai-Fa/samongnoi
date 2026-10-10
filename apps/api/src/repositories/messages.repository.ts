import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { messages, type MessageRow } from '../db/schema';

export type { MessageRow };
export type NewMessageRow = typeof messages.$inferInsert;
export type MessageUpdate = Partial<Pick<NewMessageRow, 'content' | 'status' | 'error'>>;

export interface MessagePageCursor {
  createdAt: Date;
  id: string;
}

export async function insertMessage(db: Db, values: NewMessageRow): Promise<MessageRow> {
  const [row] = await db.insert(messages).values(values).returning();
  if (!row) throw new Error('Insert returned no row');
  return row;
}

/** Returns undefined when the message no longer exists. */
export async function updateMessage(
  db: Db,
  id: string,
  values: MessageUpdate,
): Promise<MessageRow | undefined> {
  const [row] = await db.update(messages).set(values).where(eq(messages.id, id)).returning();
  return row;
}

/** Newest first. Pass `before` to read the page of messages older than a cursor. */
export async function listMessagesPage(
  db: Db,
  { threadId, before, limit }: { threadId: string; before?: MessagePageCursor; limit: number },
): Promise<MessageRow[]> {
  const older = before
    ? sql`(${messages.createdAt}, ${messages.id}) < (${before.createdAt.toISOString()}::timestamptz, ${before.id}::uuid)`
    : undefined;
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.threadId, threadId), older))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);
}
