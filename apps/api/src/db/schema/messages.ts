import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { threads } from './threads';

export const messageRole = pgEnum('message_role', ['user', 'assistant']);
export const messageStatus = pgEnum('message_status', ['streaming', 'complete', 'failed']);

/** One chat message. `author_key` = sha256(clientId), null for the AI. */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    role: messageRole('role').notNull(),
    authorKey: text('author_key'),
    authorName: text('author_name'),
    content: text('content').notNull().default(''),
    status: messageStatus('status').notNull().default('complete'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('messages_thread_created_idx').on(
      table.threadId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export type MessageRow = typeof messages.$inferSelect;
