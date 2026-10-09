import { DurableObject } from 'cloudflare:workers';
import { clientEventSchema, REALTIME_PROTOCOL, type Message, type ServerEvent } from '@repo/shared';
import { createDeps } from '../middleware/deps';
import { NAME_HEADER, PRESENCE_HEADER } from '../lib/rooms';
import { answerQuestion } from '../services/chat.service';
import type { AnswerRequest } from '../types/chat';

interface Attachment {
  presenceId: string;
  name: string;
}

/** Typing pings are relayed at most once per this many ms per socket. */
const TYPING_EVERY_MS = 2000;

function attachmentOf(ws: WebSocket): Attachment | undefined {
  const value = ws.deserializeAttachment() as Partial<Attachment> | null;
  return value && typeof value.presenceId === 'string' && typeof value.name === 'string'
    ? { presenceId: value.presenceId, name: value.name }
    : undefined;
}

/**
 * One room per thread. Holds the thread's WebSockets (hibernating when idle), who is present,
 * typing pings, and a queue that answers one question at a time. Messages are saved in Neon by
 * the services; the room only relays what they produce.
 */
export class ThreadRoom extends DurableObject<Env> {
  // Answers run one after another, so they arrive in the order they were asked.
  private answers: Promise<void> = Promise.resolve();
  // In memory only: resets on hibernation, which costs at most one extra ping.
  private lastTypingAt = new WeakMap<WebSocket, number>();

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a websocket upgrade', { status: 426 });
    }
    const presenceId = request.headers.get(PRESENCE_HEADER);
    const name = request.headers.get(NAME_HEADER);
    if (!presenceId || !name) return new Response('missing identity', { status: 400 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ presenceId, name } satisfies Attachment);
    this.broadcastPresence();
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': REALTIME_PROTOCOL },
    });
  }

  /** RPC: queues an answer and returns at once. The answer streams in the background. */
  async ask(job: AnswerRequest): Promise<void> {
    this.announce(job);
    this.answers = this.answers.then(() => this.runAnswer(job));
    // Promises passed to waitUntil keep the object in memory until they settle (see the spike
    // outcome in docs/PRODUCT.md), so the stream survives after this call returns.
    this.ctx.waitUntil(this.answers);
  }

  /** RPC: tells viewers the thread changed. A deleted thread also closes every socket. */
  async notify(event: ServerEvent): Promise<void> {
    this.broadcast(event);
    if (event.type === 'thread.deleted') {
      for (const ws of this.ctx.getWebSockets()) ws.close(4404, 'thread deleted');
    }
  }

  override webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): void {
    if (typeof raw !== 'string') return;
    let parsed: ReturnType<typeof clientEventSchema.safeParse>;
    try {
      parsed = clientEventSchema.safeParse(JSON.parse(raw));
    } catch {
      return;
    }
    if (!parsed.success) return;

    const now = Date.now();
    if (now - (this.lastTypingAt.get(ws) ?? 0) < TYPING_EVERY_MS) return;
    this.lastTypingAt.set(ws, now);
    const sender = attachmentOf(ws);
    if (sender)
      this.broadcast({ type: 'typing', presenceId: sender.presenceId, name: sender.name }, ws);
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): void {
    // Presence first, so it updates even if the handshake below throws.
    this.broadcastPresence(ws);
    // Applications may only send 1000 or 3000–4999 back. Browsers leave with 1001 or no code
    // (1005), and echoing those throws.
    const sendable = code === 1000 || (code >= 3000 && code <= 4999);
    ws.close(sendable ? code : 1000, reason);
  }

  private async runAnswer(job: AnswerRequest): Promise<void> {
    try {
      await answerQuestion(createDeps(this.env), job, (event) => this.broadcast(event));
    } catch (error) {
      // answerQuestion handles model failures itself; anything else is logged, and the queue
      // continues with the next answer.
      console.error('Answer job crashed', {
        threadId: job.threadId,
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  /** Shows the question and the empty answer. "Mine" is decided per socket, never sent as a raw id. */
  private announce(job: AnswerRequest): void {
    for (const ws of this.ctx.getWebSockets()) {
      const mine = attachmentOf(ws)?.presenceId === job.authorPresenceId;
      this.send(ws, { type: 'message.created', message: { ...job.userMessage, isMine: mine } });
      this.send(ws, {
        type: 'message.created',
        message: { ...job.assistantMessage, isMine: false } satisfies Message,
      });
    }
  }

  private broadcast(event: ServerEvent, except?: WebSocket): void {
    const body = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except) ws.send(body);
    }
  }

  private broadcastPresence(except?: WebSocket): void {
    const users = new Map<string, string>();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const who = attachmentOf(ws);
      if (who) users.set(who.presenceId, who.name);
    }
    this.broadcast(
      { type: 'presence', users: [...users].map(([presenceId, name]) => ({ presenceId, name })) },
      except,
    );
  }

  private send(ws: WebSocket, event: ServerEvent): void {
    ws.send(JSON.stringify(event));
  }
}
