import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleError } from '../src/app';
import type { AppEnv } from '../src/types/app';
import { messagesRoutes } from '../src/routes/messages.routes';
import { createThread } from '../src/services/threads.service';
import { updateThread } from '../src/repositories/threads.repository';
import { makeFakeDeps } from './support/fake-deps';
import { resetMessages } from './support/in-memory-messages';
import { resetThreads } from './support/in-memory-threads';

vi.mock('../src/repositories/threads.repository', () => import('./support/in-memory-threads'));
vi.mock('../src/repositories/messages.repository', () => import('./support/in-memory-messages'));

// The real routes and error mapping, with fake dependencies (no model, no room, no database).
const fake = makeFakeDeps();
const app = new Hono<AppEnv>()
  .basePath('/api')
  .use(async (c, next) => {
    c.set('deps', fake.deps);
    await next();
  })
  .route('/threads', messagesRoutes)
  .onError(handleError);

const alice = crypto.randomUUID();
const bob = crypto.randomUUID();
const guest = (clientId: string, name: string) => ({
  'X-Client-Id': clientId,
  'X-Client-Name': encodeURIComponent(name),
  'Content-Type': 'application/json',
});

async function readyThreadId(): Promise<string> {
  const thread = await createThread(
    fake.deps,
    { key: 'a'.repeat(64), name: 'Alice' },
    {
      type: 'text',
      title: 'Notes',
      content: 'About cats.',
    },
  );
  await updateThread(fake.deps.db, thread.id, { status: 'ready' });
  return thread.id;
}

beforeEach(() => {
  resetThreads();
  resetMessages();
  fake.rooms.ask.mockClear();
});

describe('POST /api/threads/:id/messages', () => {
  it('accepts a question for a ready thread with 202 and a message id, and never returns raw ids', async () => {
    const id = await readyThreadId();
    const res = await app.request(`/api/threads/${id}/messages`, {
      method: 'POST',
      headers: guest(alice, 'Alice'),
      body: JSON.stringify({ content: 'Do cats purr?' }),
    });
    const text = await res.text();

    expect(res.status).toBe(202);
    expect(JSON.parse(text)).toEqual({ messageId: expect.any(String) });
    expect(text).not.toContain(alice);
    expect(fake.rooms.ask).toHaveBeenCalledTimes(1);
  });

  it('refuses a question for a thread that is not ready (409)', async () => {
    const thread = await createThread(
      fake.deps,
      { key: 'a'.repeat(64), name: 'Alice' },
      {
        type: 'text',
        title: 'Notes',
        content: 'About cats.',
      },
    );
    const res = await app.request(`/api/threads/${thread.id}/messages`, {
      method: 'POST',
      headers: guest(alice, 'Alice'),
      body: JSON.stringify({ content: 'Too early?' }),
    });
    expect(res.status).toBe(409);
    expect(fake.rooms.ask).not.toHaveBeenCalled();
  });

  it('rejects an empty question with the friendly message (400)', async () => {
    const id = await readyThreadId();
    const res = await app.request(`/api/threads/${id}/messages`, {
      method: 'POST',
      headers: guest(alice, 'Alice'),
      body: JSON.stringify({ content: '   ' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: 'validation_error', message: 'Type a question first' },
    });
  });

  it('requires guest headers (400) and an existing thread (404)', async () => {
    const id = await readyThreadId();
    const noHeaders = await app.request(`/api/threads/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: 'Hi' }),
    });
    expect(noHeaders.status).toBe(400);

    const missing = await app.request(`/api/threads/${crypto.randomUUID()}/messages`, {
      method: 'POST',
      headers: guest(alice, 'Alice'),
      body: JSON.stringify({ content: 'Hi' }),
    });
    expect(missing.status).toBe(404);
  });
});

describe('GET /api/threads/:id/messages', () => {
  it('lists the conversation oldest first, with isMine per viewer', async () => {
    const id = await readyThreadId();
    await app.request(`/api/threads/${id}/messages`, {
      method: 'POST',
      headers: guest(alice, 'Alice'),
      body: JSON.stringify({ content: 'First question' }),
    });

    const asBob = await app.request(`/api/threads/${id}/messages`, { headers: guest(bob, 'Bob') });
    const body = await asBob.json<{
      items: { content: string; isMine: boolean; role: string }[];
    }>();

    expect(asBob.status).toBe(200);
    expect(body.items.map((item) => item.role)).toEqual(['user', 'assistant']);
    expect(body.items[0]).toMatchObject({ content: 'First question', isMine: false });
  });
});
