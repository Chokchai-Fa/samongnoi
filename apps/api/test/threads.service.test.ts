import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeCursor, encodeCursor } from '../src/lib/cursor';
import { ForbiddenError, NotFoundError, ValidationError } from '../src/lib/errors';
import { sha256Hex } from '../src/lib/hash';
import {
  createTextThread,
  deleteThread,
  getThread,
  listThreads,
} from '../src/services/threads.service';
import type { Deps } from '../src/types/deps';
import type { GuestIdentity } from '../src/types/guest';
import { resetThreads } from './support/in-memory-threads';

// The repository is replaced by an in-memory one, so `db` is never touched.
vi.mock('../src/repositories/threads.repository', () => import('./support/in-memory-threads'));

const deps = {
  db: {},
  config: {},
  cache: {},
  queue: { enqueue: async () => {} },
} as unknown as Deps;

const alice: GuestIdentity = { key: 'hash-alice', name: 'Alice' };
const bob: GuestIdentity = { key: 'hash-bob', name: 'Bob' };
const text = { type: 'text' as const, title: 'Hello', content: 'World' };

beforeEach(() => resetThreads());

describe('threads.service', () => {
  it('creates a ready text thread for its creator, without exposing the creator key', async () => {
    const thread = await createTextThread(deps, alice, text);

    expect(thread).toMatchObject({
      title: 'Hello',
      content: 'World',
      status: 'ready',
      sourceType: 'text',
      creatorName: 'Alice',
      isMine: true,
    });
    expect(thread).not.toHaveProperty('creatorKey');
  });

  it('computes isMine per viewer', async () => {
    const thread = await createTextThread(deps, alice, text);

    expect((await getThread(deps, alice, thread.id)).isMine).toBe(true);
    expect((await getThread(deps, bob, thread.id)).isMine).toBe(false);
  });

  it('lists newest first in cursor pages, without content', async () => {
    for (const title of ['one', 'two', 'three', 'four', 'five']) {
      await createTextThread(deps, alice, { ...text, title });
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
    await expect(getThread(deps, alice, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lets only the creator delete a thread', async () => {
    const thread = await createTextThread(deps, alice, text);

    await expect(deleteThread(deps, bob, thread.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getThread(deps, bob, thread.id)).resolves.toMatchObject({ id: thread.id });

    await deleteThread(deps, alice, thread.id);
    await expect(getThread(deps, alice, thread.id)).rejects.toBeInstanceOf(NotFoundError);
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
