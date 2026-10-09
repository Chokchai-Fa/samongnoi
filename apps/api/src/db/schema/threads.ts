import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const threadSourceType = pgEnum('thread_source_type', ['url', 'text']);
export const threadStatus = pgEnum('thread_status', ['pending', 'processing', 'ready', 'failed']);

/** A saved item and its discussion source. `creator_key` = sha256(clientId), never the raw id. */
export const threads = pgTable(
  'threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorKey: text('creator_key').notNull(),
    creatorName: text('creator_name').notNull(),
    sourceType: threadSourceType('source_type').notNull(),
    sourceUrl: text('source_url'),
    note: text('note'),
    title: text('title'),
    siteName: text('site_name'),
    imageUrl: text('image_url'),
    content: text('content'),
    summary: text('summary'),
    keyPoints: jsonb('key_points').$type<string[]>(),
    suggestedQuestions: jsonb('suggested_questions').$type<string[]>(),
    status: threadStatus('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('threads_creator_key_idx').on(table.creatorKey),
    // Newest-first pages with a stable tie-breaker for the cursor.
    index('threads_created_at_idx').on(table.createdAt.desc(), table.id.desc()),
  ],
);

export type ThreadRow = typeof threads.$inferSelect;
