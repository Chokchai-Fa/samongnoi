import { z } from 'zod';

/** Titles stay short enough for a card; content is capped to keep each thread small in Neon. */
export const THREAD_TITLE_MAX = 200;
export const THREAD_CONTENT_MAX = 60_000;

export const threadStatusSchema = z.enum(['pending', 'processing', 'ready', 'failed']);
export const threadSourceTypeSchema = z.enum(['url', 'text']);

/** `POST /api/threads` body. Phase 3 adds the `url` variant. */
export const createThreadSchema = z.object({
  type: z.literal('text'),
  title: z
    .string()
    .trim()
    .min(1, 'Give it a title')
    .max(THREAD_TITLE_MAX, `Keep the title under ${THREAD_TITLE_MAX} characters`),
  content: z
    .string()
    .trim()
    .min(1, 'Paste some text first')
    .max(THREAD_CONTENT_MAX, 'That text is too long — keep it under 60,000 characters'),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;

/** Everything a list card needs. Never includes the content. */
export const threadSummarySchema = z.object({
  id: z.uuid(),
  sourceType: threadSourceTypeSchema,
  status: threadStatusSchema,
  title: z.string().nullable(),
  siteName: z.string().nullable(),
  imageUrl: z.string().nullable(),
  error: z.string().nullable(),
  creatorName: z.string(),
  isMine: z.boolean(),
  createdAt: z.iso.datetime(),
});

/** `GET /api/threads/:id`: the summary plus the full text and AI fields (null until Phase 3). */
export const threadSchema = threadSummarySchema.extend({
  sourceUrl: z.string().nullable(),
  note: z.string().nullable(),
  content: z.string().nullable(),
  summary: z.string().nullable(),
  keyPoints: z.array(z.string()).nullable(),
  suggestedQuestions: z.array(z.string()).nullable(),
});

/** `GET /api/threads` response: one cursor page, newest first. */
export const threadListSchema = z.object({
  items: z.array(threadSummarySchema),
  nextCursor: z.string().nullable(),
});

export const listThreadsQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const threadIdParamSchema = z.object({
  id: z.uuid(),
});

export type ThreadSummary = z.infer<typeof threadSummarySchema>;
export type Thread = z.infer<typeof threadSchema>;
export type ThreadList = z.infer<typeof threadListSchema>;
