import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeCursor, encodeCursor } from '../src/lib/cursor';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../src/lib/errors';
import { sha256Hex } from '../src/lib/hash';
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  retryThread,
} from '../src/services/threads.service';
import type { GuestIdentity } from '../src/types/guest';
import { makeFakeDeps } from './support/fake-deps';
import { resetThreads } from './support/in-memory-threads';

// The repository is replaced by an in-memory one, so `db` is never touched.
vi.mock('../src/repositories/threads.repository', () => import('./support/in-memory-threads'));

const alice: GuestIdentity = { key: 'hash-alice', name: 'Alice' };
const bob: GuestIdentity = { key: 'hash-bob', name: 'Bob' };
const text = { type: 'text' as const, title: 'Hello', content: 'World' };
const link = { type: 'url' as const, url: 'https://example.com/article' };

beforeEach(() => resetThreads());

describe('threads.service: create', () => {
  it('saves a text thread as pending and queues its summary, without exposing the creator key', async () => {
    const { deps, enqueued } = makeFakeDeps();
    const thread = await createThread(deps, alice, text);

    expect(thread).toMatchObject({
      title: 'Hello',
      content: 'World',
      status: 'pending',
      sourceType: 'text',
      creatorName: 'Alice',
      isMine: true,
    });
    expect(thread).not.toHaveProperty('creatorKey');
    expect(enqueued).toEqual([{ type: 'summarize-thread', threadId: thread.id }]);
  });

  it('saves a link as pending with its note, and queues the job', async () => {
    const { deps, enqueued } = makeFakeDeps();
    const thread = await createThread(deps, alice, { ...link, note: 'for later' });

    expect(thread).toMatchObject({
      sourceType: 'url',
      sourceUrl: 'https://example.com/article',
      note: 'for later',
      status: 'pending',
      content: null,
    });
    expect(enqueued).toEqual([{ type: 'summarize-thread', threadId: thread.id }]);
  });

  it('marks the thread failed (with Retry available) when the queue refuses the job', async () => {
    const { deps } = makeFakeDeps({ failEnqueue: true });
    const thread = await createThread(deps, alice, link);

    expect(thread.status).toBe('failed');
    expect(thread.error).toBe("Couldn't start reading this. Try again.");
  });
});

describe('threads.service: list and get', () => {
  it('computes isMine per viewer', async () => {
    const { deps } = makeFakeDeps();
    const thread = await createThread(deps, alice, text);

    expect((await getThread(deps, alice, thread.id)).isMine).toBe(true);
    expect((await getThread(deps, bob, thread.id)).isMine).toBe(false);
  });

  it('lists newest first in cursor pages, without content', async () => {
    const { deps } = makeFakeDeps();
    for (const title of ['one', 'two', 'three', 'four', 'five']) {
      await createThread(deps, alice, { ...text, title });
    }

    const first = await listThreads(deps, bob, { limit: 2 });
    expect(first.items.map((item) => item.title)).toEqual(['five', 'four']);
    expect(first.items[0]).not.toHaveProperty('content');
    expect(first.nextCursor).not.toBeNull();

    const second = await listThreads(deps, bob, { limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((item) => item.title)).toEqual(['three', 'two']);
    expect(second.nextCursor).not.toBeNull();

    const last = await listThreads(deps, bob, { limit: 2, cursor: second.nextCursor! });
    expect(last.items.map((item) => item.title)).toEqual(['one']);
    expect(last.nextCursor).toBeNull();
  });

  it('reports NotFound for an unknown thread', async () => {
    const { deps } = makeFakeDeps();
    await expect(getThread(deps, alice, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('threads.service: delete', () => {
  it('lets only the creator delete a thread', async () => {
    const { deps } = makeFakeDeps();
    const thread = await createThread(deps, alice, text);

    await expect(deleteThread(deps, bob, thread.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getThread(deps, bob, thread.id)).resolves.toMatchObject({ id: thread.id });

    await deleteThread(deps, alice, thread.id);
    await expect(getThread(deps, alice, thread.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('threads.service: retry', () => {
  async function failedLink() {
    const fake = makeFakeDeps({ failEnqueue: true });
    const thread = await createThread(fake.deps, alice, link);
    // Queue is healthy again for the retry.
    const healthy = makeFakeDeps();
    return { thread, deps: healthy.deps, enqueued: healthy.enqueued };
  }

  it('lets the creator retry a failed thread: back to pending, job queued again', async () => {
    const { thread, deps, enqueued } = await failedLink();

    const retried = await retryThread(deps, alice, thread.id);

    expect(retried.status).toBe('pending');
    expect(retried.error).toBeNull();
    expect(enqueued).toEqual([{ type: 'summarize-thread', threadId: thread.id }]);
  });

  it('refuses retries from other browsers (403)', async () => {
    const { thread, deps } = await failedLink();
    await expect(retryThread(deps, bob, thread.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('refuses to retry a thread that did not fail (409)', async () => {
    const { deps } = makeFakeDeps();
    const thread = await createThread(deps, alice, text);
    await expect(retryThread(deps, alice, thread.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('reports NotFound for an unknown thread', async () => {
    const { deps } = makeFakeDeps();
    await expect(retryThread(deps, alice, crypto.randomUUID())).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('cursor', () => {
  it('round-trips and rejects tampered values', () => {
    const cursor = { createdAt: new Date('2026-10-09T10:00:00.123Z'), id: crypto.randomUUID() };

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(() => decodeCursor('not-a-cursor')).toThrow(ValidationError);
  });
});

describe('sha256Hex', () => {
  it('matches the known SHA-256 digest', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
