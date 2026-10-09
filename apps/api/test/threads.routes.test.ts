import { exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetThreads } from './support/in-memory-threads';

// Full app through the Worker entry, with the repository swapped for an in-memory one.
vi.mock('../src/repositories/threads.repository', () => import('./support/in-memory-threads'));

const BASE = 'http://example.com/api/threads';
const alice = crypto.randomUUID();
const bob = crypto.randomUUID();

/** Same encoding as the web client: the name is URL-encoded so non-ASCII names survive. */
function guest(clientId: string, name = 'Guest 4821') {
  return { 'X-Client-Id': clientId, 'X-Client-Name': encodeURIComponent(name) };
}

function createThread(clientId: string, body: unknown) {
  return exports.default.fetch(BASE, {
    method: 'POST',
    headers: { ...guest(clientId), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validThread = { type: 'text', title: 'Notes', content: 'Some pasted text' };

beforeEach(() => resetThreads());

describe('guest identity headers', () => {
  it('rejects requests without guest headers', async () => {
    const res = await exports.default.fetch(BASE);
    expect(res.status).toBe(400);
    expect((await res.json<{ error: { code: string } }>()).error.code).toBe('validation_error');
  });

  it('rejects a clientId that is not a UUID', async () => {
    const res = await exports.default.fetch(BASE, {
      headers: { 'X-Client-Id': 'not-a-uuid', 'X-Client-Name': 'Guest' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects names longer than 32 characters', async () => {
    const res = await exports.default.fetch(BASE, {
      headers: guest(alice, 'x'.repeat(33)),
    });
    expect(res.status).toBe(400);
  });

  it('accepts URL-encoded non-Latin names', async () => {
    const res = await exports.default.fetch(BASE, { headers: guest(alice, 'สมชาย') });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/threads', () => {
  it('returns 202 with isMine and no raw or hashed ids', async () => {
    const res = await createThread(alice, validThread);
    const text = await res.text();

    expect(res.status).toBe(202);
    expect(JSON.parse(text)).toMatchObject({ title: 'Notes', status: 'pending', isMine: true });
    expect(text).not.toContain(alice);
    expect(text).not.toContain('creatorKey');
  });

  it('rejects an empty title with a readable message', async () => {
    const res = await createThread(alice, { ...validThread, title: '   ' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: 'validation_error', message: 'Give it a title' },
    });
  });
});

describe('POST /api/threads with a link', () => {
  it('returns 202 pending for a valid link, with the note kept', async () => {
    const res = await createThread(alice, {
      type: 'url',
      url: 'https://example.com/article',
      note: 'read later',
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({
      sourceType: 'url',
      sourceUrl: 'https://example.com/article',
      note: 'read later',
      status: 'pending',
    });
  });

  it('rejects a link that is not http(s), with the friendly message', async () => {
    const res = await createThread(alice, { type: 'url', url: 'ftp://example.com/file' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'validation_error',
        message: "That doesn't look like a link — paste the full address (https://…)",
      },
    });
  });
});

describe('POST /api/threads/:id/retry', () => {
  it('returns 409 for a thread that has not failed, 403 for another browser, 404 when unknown', async () => {
    const created = await (await createThread(alice, validThread)).json<{ id: string }>();

    const notFailed = await exports.default.fetch(`${BASE}/${created.id}/retry`, {
      method: 'POST',
      headers: guest(alice),
    });
    expect(notFailed.status).toBe(409);
    expect((await notFailed.json<{ error: { code: string } }>()).error.code).toBe('conflict');

    const otherBrowser = await exports.default.fetch(`${BASE}/${created.id}/retry`, {
      method: 'POST',
      headers: guest(bob, 'Bob'),
    });
    expect(otherBrowser.status).toBe(403);

    const unknown = await exports.default.fetch(`${BASE}/${crypto.randomUUID()}/retry`, {
      method: 'POST',
      headers: guest(alice),
    });
    expect(unknown.status).toBe(404);
  });
});

describe('GET /api/threads', () => {
  it('shows every thread to every browser, with isMine per viewer and no content', async () => {
    await createThread(alice, validThread);

    const asBob = await exports.default.fetch(BASE, { headers: guest(bob, 'Bob') });
    const body = await asBob.json<{
      items: Record<string, unknown>[];
      nextCursor: string | null;
    }>();

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ creatorName: 'Guest 4821', isMine: false });
    expect(body.items[0]).not.toHaveProperty('content');
    expect(body.nextCursor).toBeNull();
  });

  it('pages with an opaque cursor', async () => {
    for (const title of ['a', 'b', 'c']) await createThread(alice, { ...validThread, title });

    const first = await exports.default.fetch(`${BASE}?limit=2`, { headers: guest(alice) });
    const page1 = await first.json<{ items: { title: string }[]; nextCursor: string | null }>();
    expect(page1.items.map((item) => item.title)).toEqual(['c', 'b']);
    expect(page1.nextCursor).not.toBeNull();

    const second = await exports.default.fetch(`${BASE}?limit=2&cursor=${page1.nextCursor}`, {
      headers: guest(alice),
    });
    const page2 = await second.json<{ items: { title: string }[]; nextCursor: string | null }>();
    expect(page2.items.map((item) => item.title)).toEqual(['a']);
    expect(page2.nextCursor).toBeNull();
  });

  it('rejects a tampered cursor', async () => {
    const res = await exports.default.fetch(`${BASE}?cursor=garbage`, { headers: guest(alice) });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/threads/:id', () => {
  it('returns the full thread for an existing id', async () => {
    const created = await (await createThread(alice, validThread)).json<{ id: string }>();

    const res = await exports.default.fetch(`${BASE}/${created.id}`, { headers: guest(bob) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: created.id, content: 'Some pasted text' });
  });

  it('returns 400 for a malformed id and 404 for an unknown one', async () => {
    const malformed = await exports.default.fetch(`${BASE}/not-a-uuid`, { headers: guest(alice) });
    expect(malformed.status).toBe(400);

    const unknown = await exports.default.fetch(`${BASE}/${crypto.randomUUID()}`, {
      headers: guest(alice),
    });
    expect(unknown.status).toBe(404);
    expect((await unknown.json<{ error: { code: string } }>()).error.code).toBe('not_found');
  });
});

describe('DELETE /api/threads/:id', () => {
  it('returns 403 for another browser and 204 for the creator', async () => {
    const created = await (await createThread(alice, validThread)).json<{ id: string }>();

    const denied = await exports.default.fetch(`${BASE}/${created.id}`, {
      method: 'DELETE',
      headers: guest(bob, 'Bob'),
    });
    expect(denied.status).toBe(403);
    expect((await denied.json<{ error: { code: string } }>()).error.code).toBe('forbidden');

    const deleted = await exports.default.fetch(`${BASE}/${created.id}`, {
      method: 'DELETE',
      headers: guest(alice),
    });
    expect(deleted.status).toBe(204);

    const gone = await exports.default.fetch(`${BASE}/${created.id}`, { headers: guest(alice) });
    expect(gone.status).toBe(404);
  });
});
