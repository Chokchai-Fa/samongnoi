import { exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMessages } from './support/in-memory-messages';
import { insertThread, resetThreads } from './support/in-memory-threads';

// The real Worker and the real ThreadRoom Durable Object; the database is in memory.
vi.mock('../src/repositories/threads.repository', () => import('./support/in-memory-threads'));
vi.mock('../src/repositories/messages.repository', () => import('./support/in-memory-messages'));

// The model is a fixed, slow stream: long enough to tell the POST returning from the answer ending.
const model = vi.hoisted(() => ({ chunks: ['Cats ', 'purr ', 'when ', 'content.'], delayMs: 200 }));
vi.mock('../src/lib/ai', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createAi: () => ({
      summarize: () => Promise.reject(new Error('summarize is not used here')),
      async *chat() {
        for (const text of model.chunks) {
          await new Promise((resolve) => setTimeout(resolve, model.delayMs));
          yield text;
        }
      },
    }),
  };
});

const ORIGIN = 'http://localhost:5173'; // APP_URL in the test bindings
const API = 'http://example.com/api/threads';
const alice = crypto.randomUUID();
const bob = crypto.randomUUID();

type Received = Record<string, unknown>;
interface Socket {
  messages: Received[];
  closeCode: number | undefined;
  send(event: Record<string, unknown>): void;
  close(code?: number): void;
}

beforeEach(() => {
  resetThreads();
  resetMessages();
});

async function createThread(clientId: string, name: string): Promise<string> {
  const res = await exports.default.fetch(API, {
    method: 'POST',
    headers: {
      'X-Client-Id': clientId,
      'X-Client-Name': encodeURIComponent(name),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'text', title: 'Notes', content: 'About cats.' }),
  });
  return ((await res.json()) as { id: string }).id;
}

async function connect(
  threadId: string,
  clientId: string,
  name: string,
  origin = ORIGIN,
): Promise<{ status: number; protocol?: string | null; socket?: Socket }> {
  const res = await exports.default.fetch(
    `${API}/${threadId}/ws?name=${encodeURIComponent(name)}`,
    {
      headers: {
        Upgrade: 'websocket',
        Origin: origin,
        'Sec-WebSocket-Protocol': `samongnoi, cid.${clientId}`,
      },
    },
  );
  const ws = res.webSocket;
  if (!ws) return { status: res.status };
  ws.accept();
  const socket: Socket = {
    messages: [],
    closeCode: undefined,
    send: (event) => ws.send(JSON.stringify(event)),
    close: (code) => ws.close(code),
  };
  ws.addEventListener('message', (event) => {
    socket.messages.push(JSON.parse(String(event.data)) as Received);
  });
  ws.addEventListener('close', (event) => {
    socket.closeCode = event.code;
  });
  return { status: res.status, protocol: res.headers.get('Sec-WebSocket-Protocol'), socket };
}

/** Polls until the predicate holds (events arrive asynchronously from the room). */
async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** The newest presence list this socket received, as sorted names. */
function presenceNames(socket: Socket | undefined): string[] {
  const latest = socket?.messages.filter((m) => m.type === 'presence').at(-1) as
    { users: { name: string }[] } | undefined;
  return latest ? latest.users.map((user) => user.name).sort() : [];
}

/** A thread that is already answered, so questions go straight to the room. */
async function readyThread(): Promise<string> {
  const row = await insertThread(undefined, {
    creatorKey: 'a'.repeat(64),
    creatorName: 'Alice',
    sourceType: 'text',
    title: 'Notes',
    content: 'About cats.',
    summary: 'Cats purr.',
    keyPoints: ['Cats purr'],
    suggestedQuestions: ['Why do cats purr?'],
    status: 'ready',
  });
  return row.id;
}

describe('WebSocket room', () => {
  it('refuses an upgrade from another origin (403)', async () => {
    const id = await createThread(alice, 'Alice');
    const { status, socket } = await connect(id, bob, 'Bob', 'https://evil.example');
    expect(status).toBe(403);
    expect(socket).toBeUndefined();
  });

  it('requires a guest id in the subprotocol (400)', async () => {
    const id = await createThread(alice, 'Alice');
    const res = await exports.default.fetch(`${API}/${id}/ws?name=Bob`, {
      headers: { Upgrade: 'websocket', Origin: ORIGIN },
    });
    expect(res.status).toBe(400);
  });

  it('shares presence, relays typing to others only, and closes every socket when the thread is deleted', async () => {
    const id = await createThread(alice, 'Alice');
    const a = await connect(id, alice, 'Alice');
    const b = await connect(id, bob, 'Bob');
    expect(a.status).toBe(101);
    expect(b.status).toBe(101);
    // Browsers drop a socket whose server does not echo one of the subprotocols they asked for.
    expect(a.protocol).toBe('samongnoi');
    if (!a.socket || !b.socket) throw new Error('sockets not opened');

    // Alice sees both people present.
    await until(
      () =>
        a.socket?.messages.some(
          (m) => m.type === 'presence' && (m.users as unknown[]).length === 2,
        ) ?? false,
      'presence with two people',
    );
    const presence = a.socket.messages.filter((m) => m.type === 'presence').at(-1) as {
      users: { name: string }[];
    };
    expect(presence.users.map((user) => user.name).sort()).toEqual(['Alice', 'Bob']);

    // Typing reaches Bob with Alice's name, and does not echo back to Alice.
    a.socket.send({ type: 'typing' });
    await until(
      () => b.socket?.messages.some((m) => m.type === 'typing') ?? false,
      'typing for Bob',
    );
    const typing = b.socket.messages.find((m) => m.type === 'typing');
    expect(typing).toMatchObject({ name: 'Alice' });
    expect(a.socket.messages.some((m) => m.type === 'typing')).toBe(false);

    // Deleting the thread tells both viewers and closes their sockets.
    const deleted = await exports.default.fetch(`${API}/${id}`, {
      method: 'DELETE',
      headers: { 'X-Client-Id': alice, 'X-Client-Name': 'Alice' },
    });
    expect(deleted.status).toBe(204);
    await until(
      () => b.socket?.messages.some((m) => m.type === 'thread.deleted') ?? false,
      'thread.deleted',
    );
    await until(() => (b.socket?.closeCode ?? 0) === 4404, 'close with code 4404');
    expect(b.socket.closeCode).toBe(4404);
  });

  it('drops a viewer from presence when they leave with no close code', async () => {
    const id = await readyThread();
    const a = await connect(id, alice, 'Alice');
    const b = await connect(id, bob, 'Bob');
    if (!a.socket || !b.socket) throw new Error('sockets not opened');
    await until(() => presenceNames(a.socket).length === 2, 'two people present');

    // ws.close() with no argument: the server sees code 1005, which it may not send back.
    b.socket.close();

    await until(() => presenceNames(a.socket).length === 1, 'Bob to leave the presence list');
    expect(presenceNames(a.socket)).toEqual(['Alice']);
  });

  it('streams one answer to every viewer, and the POST returns before the answer ends', async () => {
    const id = await readyThread();
    const a = await connect(id, alice, 'Alice');
    const b = await connect(id, bob, 'Bob');
    if (!a.socket || !b.socket) throw new Error('sockets not opened');

    const res = await exports.default.fetch(`${API}/${id}/messages`, {
      method: 'POST',
      headers: {
        'X-Client-Id': alice,
        'X-Client-Name': 'Alice',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: 'Do cats purr?' }),
    });
    expect(res.status).toBe(202);
    // The answer takes about 800 ms, so the POST must have come back while it was still streaming.
    expect(b.socket.messages.some((m) => m.type === 'message.completed')).toBe(false);

    await until(
      () => b.socket?.messages.some((m) => m.type === 'message.completed') ?? false,
      'the answer to finish',
    );
    await until(
      () => a.socket?.messages.some((m) => m.type === 'message.completed') ?? false,
      'Alice to see the answer finish',
    );

    const createdFor = (socket: Socket) =>
      socket.messages
        .filter((m) => m.type === 'message.created')
        .map((m) => m.message as Record<string, unknown>);
    const [question, answer] = createdFor(b.socket);
    expect(question).toMatchObject({ role: 'user', content: 'Do cats purr?', isMine: false });
    expect(answer).toMatchObject({ role: 'assistant', isMine: false });

    // Each chunk arrives once, in order, tagged with the assistant message's id.
    const deltas = b.socket.messages.filter((m) => m.type === 'message.delta');
    expect(deltas.every((m) => m.messageId === answer?.id)).toBe(true);
    expect(deltas.map((m) => m.text).join('')).toBe('Cats purr when content.');
    expect(b.socket.messages.find((m) => m.type === 'message.completed')).toMatchObject({
      messageId: answer?.id,
      content: 'Cats purr when content.',
    });

    // Alice's own question is marked as hers; she gets the same answer.
    expect(createdFor(a.socket)[0]).toMatchObject({ content: 'Do cats purr?', isMine: true });
    expect(a.socket.messages.find((m) => m.type === 'message.completed')).toMatchObject({
      messageId: answer?.id,
      content: 'Cats purr when content.',
    });
  });
});
