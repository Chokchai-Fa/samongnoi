# Product spec — samongnoi: read-later with AI threads (POC)

Save a link (or paste text). The app reads it in the background, writes an AI summary, and turns
it into a **thread** you can open and chat with — ask questions, argue with it, or dig deeper,
grounded in that source. In the MVP there are **no accounts**: everyone using the app sees all
threads, and anyone viewing a thread shares one live conversation with each other and the AI.
Sign-in, private threads, and sharing come **after the MVP** (see "Post-MVP: auth & sharing").

## User flow

```
[Home: all threads] ──"+ New"──► [New: URL | Text form] ──submit──► back to Home
       ▲                                                              │
       │                        card shows "Summarizing…" (skeleton)  │
       │                                  │ queue job finishes        │
       │                                  ▼                           │
       └──────────── card becomes a ready thread (title, image, summary) ◄┘
                                   │ click
                                   ▼
        [Thread: source header + summary + key points + shared live chat]
           anyone asks → AI answer streams live to everyone viewing the thread
           "Copy link" → send the thread URL to a friend
```

1. **First visit**: the app creates a random guest identity in the browser (`clientId` +
   display name like "Guest 4821"). A small "Your name" field in the top-bar menu lets the
   user change it. No sign-up, no login.
2. **New** (`/new`): two tabs — **Link** (URL, optional note) or **Text** (title + pasted
   content). Notice: "Everything you post is visible to everyone using this app — don't save
   private content." Submit → API returns `202` immediately → navigate to Home.
3. **Home** (`/`): **all** threads, newest first, with "by Guest 4821" on each card and a
   "Mine" badge on ones created from this browser. Pending items show a "Summarizing…" card;
   failed items show an error + **Retry**. While any item is pending, the list polls every 3 s.
4. **Thread** (`/threads/:id`): header (title, site, image, open-original link, **Copy link**),
   collapsible summary + key points, 3 suggested questions, then the shared chat. Messages show
   the author's display name (+ a generated color/initials avatar); the AI's answer streams
   token by token **to everyone viewing the thread**. A presence row shows who is here now and
   "Guest 4821 is typing…".

## MVP scope

In:
- **No authentication.** Guest identity per browser (random `clientId` + editable display name).
- All threads visible to everyone. Create from URL or pasted text; list, open.
- Delete / retry: only from the **browser that created the thread** (creator key, see below).
- Background pipeline: fetch → extract → summarize (queue consumer).
- **Shared live chat:** one conversation per thread; AI answers stream to everyone viewing it in
  real time over WebSocket; presence + typing indicator.
- **Abuse protection without accounts:** per-IP daily limits + global daily caps (Redis) so a
  public URL can't burn the free AI/DB quotas.

Out (post-MVP): Google sign-in, private threads, owner/member roles, invite links, claiming
guest threads after sign-in, invite by email, cross-thread "ask all my saved items"
(embeddings + Upstash Vector), tags and search, PDF/YouTube sources, PWA share target.

## Guest identity (no auth)

Identity is a **convenience, not security** — it only decides display names and which browser
may delete/retry its own threads.

- On first load the web app creates `clientId` (UUID v4) and a display name, stored in
  `localStorage`. Every API request sends headers `X-Client-Id` and `X-Client-Name`
  (`lib/api-client.ts` adds them).
- The server **never returns or stores raw `clientId`s**. It stores `creator_key =
  sha256(clientId)` on threads and messages and returns only `isMine: boolean` (computed by
  hashing the request's `X-Client-Id`).
- Display names: 1–32 chars, trimmed, validated with zod; stored on each message at send time
  (renaming doesn't rewrite history).
- Clearing browser storage = new guest; old threads stay but are no longer "Mine".
- This hash is also the bridge to post-MVP auth: on first sign-in, offer to claim threads whose
  `creator_key` matches this browser.

## Abuse protection (public, no accounts)

The URL is public, so limits are keyed by **IP** (`CF-Connecting-IP`) plus **global** caps.
Counters live in Redis with a TTL to midnight UTC (`rate-limit.service.ts`).

| Action | Per IP / day | Global / day | When exceeded |
|--------|-------------:|-------------:|---------------|
| Create thread | 10 | 300 | `429` "Daily limit reached — try again tomorrow" |
| Ask the AI | 50 | 1,000 | `429` same, shown inline in chat |
| Retry summary | 5 | — | `429` |

- Global caps stay well under the Gemini free tier (~1,500 req/day) and Workers AI fallback.
  Tune them from real usage.
- Content caps (below) bound Neon storage per thread.
- If bots show up: add **Cloudflare Turnstile** (free, no card; Terraform-managed widget) to the
  New form and chat input — a post-MVP step unless abuse appears earlier.

## Architecture

```
web ──POST /threads──► api ──insert thread(pending)──► Neon
                          └─send {type:'summarize-thread', threadId}──► Queue
Queue ──► api queue() consumer:
            processing → fetch URL → extract text → AI summary (JSON) → update thread
            → notify ThreadRoom DO → broadcast 'thread.updated' to anyone viewing

web ══WebSocket══► api /threads/:id/ws ──(Origin check, guest name)──► ThreadRoom DO (1 per thread)
web ──POST /threads/:id/messages──► api (validation, rate limit) ──RPC──► ThreadRoom.ask()
     ThreadRoom: save user msg → broadcast → stream AI (Gemini) → broadcast deltas
                 → save assistant msg → broadcast 'message.completed'
```

### Real-time: WebSocket via Durable Objects (not SSE)

Multiple people must see the same AI answer stream and each other's messages live. Workers are
stateless, so live fan-out needs a coordinator: one **ThreadRoom Durable Object per thread**
(available on Workers Free with SQLite storage). It holds that thread's sockets and serializes
AI requests so answers arrive in order.

- **Why WebSocket over SSE:** with a Durable Object either would work, but WebSockets use the
  **Hibernation API** — idle sockets cost no duration, which matters on the free quota. SSE
  would keep the object awake for every open connection. WS is also bidirectional (typing,
  presence) on one connection.
- **Sending stays HTTP:** posting a message is a normal `POST` (zod validation, rate limit,
  error codes). The socket is for server → client events, plus tiny client → server
  `typing` pings.
- **Socket checks:** the Worker **checks the `Origin` header equals `APP_URL`** (blocks other
  sites from opening sockets to us), validates the display name from the query string, and
  forwards the upgrade to the DO with `{ name, presenceId }` attached, where
  `presenceId = sha256(clientId)` truncated (never the raw id).
- **Source of truth is Neon.** The DO only relays events. On (re)connect the client refetches
  messages over HTTP, then applies live events — so missed events are never lost.
- **Fallback:** if the socket can't connect after retries, the thread page polls messages
  every 5 s and shows replies when complete (no token streaming).
- **Spike first (phase 4):** confirm the AI stream keeps running inside the DO after `ask()`
  returns. If it doesn't, `POST /messages` awaits the full generation (the client ignores the
  response body; tokens still arrive over the socket).

Events (zod schemas in `packages/shared/src/realtime.schema.ts`):

| Direction | Event | Payload |
|-----------|-------|---------|
| server → client | `message.created` | full message (user's, or assistant placeholder) |
| server → client | `message.delta` | `{ messageId, text }` (append) |
| server → client | `message.completed` / `message.failed` | `{ messageId, content?, error? }` |
| server → client | `presence` | `{ users: [{ presenceId, name }] }` |
| server → client | `typing` | `{ presenceId, name }` (client hides after 3 s) |
| server → client | `thread.updated` | `{ status, title?, summary? }` |
| server → client | `thread.deleted` | `{}` → viewers are sent back to Home |
| client → server | `typing` | `{}` (throttled to 1 per 2 s) |

### AI providers

All AI calls go through the **Vercel AI SDK** (`streamText` / `generateObject`), with model and
provider choices in one file: `apps/api/src/lib/ai.ts`.

| Use | Primary | Fallback (on 429 / quota / provider error) |
|-----|---------|-------------------------------------------|
| Summarize | Google **Gemini Flash** (`@ai-sdk/google`) — very large context, whole article in one call | Workers AI 8B model (`workers-ai-provider`), content truncated to fit |
| Chat | Gemini Flash | Groq (`@ai-sdk/groq`, optional, very fast) → Workers AI |

- `GEMINI_API_KEY` (and optional `GROQ_API_KEY`) are third-party secrets — add them with the
  `manage-secrets` skill. Workers AI needs no key (`[ai]` binding).
- **Privacy:** Gemini's free tier may use prompts/responses to improve Google's products, and
  all content is public in the MVP anyway — the New page notice covers both.
- Free tiers change often — only `lib/ai.ts` should need editing when they do.

### Other choices

| Concern | Choice |
|---------|--------|
| Extraction | `HTMLRewriter`: `<title>`, `og:title/description/image/site_name`, text of `article`/`main`/`p`/`h1-h3`/`li`; skip `script/style/nav/footer/aside` |
| Home list updates | Polling (only while something is pending) |
| Cache (Upstash) | Rate-limit counters (per IP + global); dedupe recent URL fetches (24 h) |

### Free-tier budget (checked Oct 2026)
- **Gemini free tier:** Flash models only, ~1,500 requests/day (limits change — check AI Studio).
- **Workers AI (fallback): 10,000 Neurons/day.**
- **Durable Objects (Free): 100,000 requests/day**, SQLite storage only. Use WebSocket
  Hibernation; incoming WS messages are billed at a fraction of a request — keep `typing`
  throttled.
- **Queues: 10,000 operations/day** (~3 per job), 24 h retention.
- **Workers: 10 ms CPU** per invocation. Waiting on `fetch`/AI doesn't count, parsing does →
  cap fetched HTML at **1 MB**, stream it through HTMLRewriter, cap stored content at
  **~60K characters**.
- **Neon 0.5 GB**: ~60 KB/thread max → thousands of threads; global create cap keeps growth bounded.

## Data model (Drizzle, `apps/api/src/db/schema/`)

```
threads
  id                   uuid pk
  creator_key          text, indexed                      -- sha256(clientId) of the creating browser
  creator_name         text                               -- display name at creation
  source_type          enum('url','text')
  source_url           text null
  note                 text null
  title                text null
  site_name            text null
  image_url            text null
  content              text null                          -- extracted text (≤ 60K chars)
  summary              text null
  key_points           jsonb null                         -- string[]
  suggested_questions  jsonb null                         -- string[3]
  status               enum('pending','processing','ready','failed')
  error                text null                          -- user-safe message
  created_at, updated_at  timestamptz
  index (created_at desc)

messages
  id           uuid pk
  thread_id    uuid fk → threads.id on delete cascade, indexed
  role         enum('user','assistant')
  author_key   text null                                  -- sha256(clientId); null for the AI
  author_name  text null                                  -- display name at send time; null for the AI
  content      text
  status       enum('streaming','complete','failed') default 'complete'
  created_at   timestamptz
```
Post-MVP auth adds Better Auth's tables and nullable `owner_id` / `author_id` columns
(expand → backfill by claim → contract); nothing here needs to be dropped.

## API (Hono, all under `/api`, no auth in the MVP)

Every request carries `X-Client-Id` / `X-Client-Name` (guest identity). Rate limits are per IP.

| Method | Path | Who | Body / query | Response |
|--------|------|-----|--------------|----------|
| GET | `/health` | anyone | — | `200 { ok: true }` |
| POST | `/threads` | anyone | `{ type:'url', url, note? }` \| `{ type:'text', title, content }` | `202` thread (`pending`) |
| GET | `/threads` | anyone | `?cursor&limit=20` | `{ items, nextCursor }` — all threads, each with `creatorName`, `isMine`, no `content` |
| GET | `/threads/:id` | anyone | — | thread + summary, key points, questions, `isMine` |
| DELETE | `/threads/:id` | creator browser | — | `204`; others → `403` · DO broadcasts `thread.deleted` |
| POST | `/threads/:id/retry` | creator browser | — | `202` (only when `failed`) |
| GET | `/threads/:id/messages` | anyone | `?cursor` | `{ items, nextCursor }` oldest → newest, with `authorName`, `isMine` |
| POST | `/threads/:id/messages` | anyone | `{ content }` | `202 { messageId }` — reply arrives over WS |
| GET | `/threads/:id/ws` | anyone (Origin-checked) | `?name` | `101` WebSocket upgrade → ThreadRoom |

Shared zod schemas: `packages/shared` → `guest.schema.ts` (headers, name rules),
`threads.schema.ts`, `messages.schema.ts`, `realtime.schema.ts`.

## Backend file map

```
routes/            threads.routes.ts, messages.routes.ts, realtime.routes.ts (ws upgrade)
middleware/        guest.ts — parse/validate X-Client-Id / X-Client-Name → c.var.guest
                   { key: sha256(clientId), name }; client-ip.ts → c.var.ip
services/          threads.service.ts       create, list, get, delete, retry (+ enqueue)
                   summarize.service.ts     fetch → extract → summarize → save → notify room
                   chat.service.ts          build prompt from thread + history, run model
                   rate-limit.service.ts    per-IP + global daily counters (Redis)
repositories/      threads, messages
durable-objects/   thread-room.ts           ThreadRoom DO: sockets (hibernation), presence,
                                            serialized ask() → chat.service, broadcast events
lib/               ai.ts (providers, models, fallback), extract.ts, fetch-page.ts, hash.ts
jobs/              queue-handler.ts → summarize.service.summarizeThread(deps, threadId)
```
`index.ts` must also `export { ThreadRoom }`; the DO is declared in `wrangler.toml`
(`durable_objects.bindings` + `migrations` with `new_sqlite_classes`).

## Pipeline rules (`summarize.service.ts`)
- Idempotent: if already `ready`, ack and return. Set `processing` at start.
- `fetch-page.ts`: only `http(s)`, 10 s timeout, max 3 redirects, max 1 MB, only
  `text/html` / `text/plain`. Errors → user-safe messages ("Couldn't read this page",
  "Page too large", "Unsupported content type").
- Text sources skip fetch/extract.
- `generateObject` with a zod schema `{ title, summary, keyPoints[3-6], suggestedQuestions[3] }`;
  on provider failure use the fallback model; on invalid output retry once, then fail.
- Queue `max_retries = 3`; on final failure set `status='failed'` + `error`.

## Chat rules (`chat.service.ts` via `ThreadRoom`)
- **One answer at a time per thread**: the DO queues `ask()` calls; later askers see
  "AI is answering Guest 4821…" and their question is answered next.
- Prompt = system instructions + title/summary + content (whole content with Gemini; truncated
  for the fallback) + last 10 messages **labelled with display names** ("Guest 4821: …") + new
  question. The AI addresses the asker and can see what others said.
- System prompt: answer from the source; say clearly when the source doesn't cover something
  (general knowledge allowed, labelled as such); reply in the asker's language.
- **Prompt injection**: page content, display names, and other people's messages are untrusted
  data — wrap them in delimiters and tell the model to ignore instructions inside them. No
  tools → impact is limited to answer text.
- Save the user message (`complete`) and an assistant placeholder (`streaming`) before calling
  the model; update it to `complete`/`failed` at the end, so a reload mid-answer shows the
  right state.
- Rate limits checked before calling the model → `429` with a friendly inline message.

## Frontend file map

```
routes/        index.tsx (Home), new.tsx, threads.$id.tsx
features/guest/
  hooks/       useGuest — create/read clientId + name in localStorage, rename
  components/  GuestNameMenu (top bar), GuestAvatar (initials + color from name)
features/threads/
  api/         useThreads (infinite + polling while pending), useThread, useCreateThread,
               useDeleteThread, useRetryThread
  components/  ThreadCard, ThreadCardPending, ThreadCardFailed, NewThreadForm (Tabs: Link|Text),
               ThreadHeader (Copy link), SummaryPanel
features/chat/
  api/         useMessages (history), useSendMessage
  realtime/    useThreadRoom — WS connect, backoff reconnect, refetch on reconnect, visibility
               reconnect, apply events to the TanStack Query cache, polling fallback
  components/  ChatMessages, ChatMessage (avatar, name, markdown, streaming cursor),
               ChatInput (sends typing pings), SuggestedQuestions, PresenceBar, TypingIndicator
lib/api-client.ts  adds X-Client-Id / X-Client-Name to every request
```
shadcn primitives: button, card, input, textarea, tabs, form, label, skeleton, badge,
scroll-area, dropdown-menu, alert-dialog (delete), avatar, tooltip, collapsible, sonner.
Markdown: `react-markdown`.

## Responsive design (required — mobile and desktop are both first-class)

Mobile-first Tailwind: base styles = phone; `md:` (≥768px) = tablet; `lg:` (≥1024px) = desktop.
Every page must be checked at **375px, 768px, and 1280px** before it's done.

| Page | Mobile (< 768px) | Desktop (≥ 1024px) |
|------|------------------|--------------------|
| App shell | Compact top bar (logo, guest-name menu); content full width with `px-4` | Top bar with "+ New" button; content `max-w-6xl mx-auto` |
| Home | Single-column card list; **floating "+" button** bottom-right above the safe area | Card grid: 2 cols at `md`, 3 cols at `lg` |
| New | Full-screen page; form fields full width; **submit button sticky at bottom** | Centered card `max-w-xl`; submit inline |
| Thread | Back button + title + presence avatars (max 3, "+N") in top bar; summary in a **collapsible** at top (auto-collapses after the first message); chat fills the rest; **input sticky at bottom** | **Two panes**: left = source + summary + key points (scrolls independently, ~2/5 width); right = presence bar + chat (~3/5) |
| Suggested questions | Horizontally scrollable chip row | Wrapped chip row |

Mobile rules:
- Use `h-dvh` / `min-h-dvh` (not `h-screen`) so layouts survive mobile browser bars and the
  on-screen keyboard; pad fixed bottom elements with `pb-[env(safe-area-inset-bottom)]`.
- Touch targets ≥ 44×44px; spacing between tappable items ≥ 8px.
- No hover-only actions: thread actions (copy link, delete, retry, open original) live in a
  visible `⋯` dropdown button.
- Inputs/textarea use `text-base` (16px) to stop iOS zoom-on-focus.
- Chat auto-scrolls to the newest message, but not while the user has scrolled up to read
  (show a "New messages ↓" pill instead).
- Images: fixed aspect ratio (`aspect-video object-cover`) + lazy loading.
- Long URLs/titles: `truncate` / `line-clamp-2` / `break-words` — never horizontal page scroll.
- Reconnect the WebSocket when the tab becomes visible again (mobile browsers suspend sockets
  in the background).

## Build phases

1. **Scaffold** — monorepo, CI/CD, infra (Neon, Upstash, Queue), one Worker serving the SPA +
   `/api/health`, deployed.
2. **Threads (text only)** — guest identity, schema + migrations, create/list/get/delete,
   Home + New + Thread pages.
3. **Pipeline** — queue consumer, URL fetch + extract, Gemini summary with Workers AI fallback,
   polling UI states.
4. **Live chat** — spike ThreadRoom DO; messages table; streaming answers to all viewers;
   presence/typing; polling fallback.
5. **Limits & polish** — per-IP + global rate limits, empty/error states, dark mode,
   responsive pass at 375/768/1280, dogfood with a friend.

## Post-MVP: auth & sharing

Planned once the MVP is in use. Design notes so nothing is lost:

- **Sign in with Google** via **Better Auth** on `/api/auth/*` (Google provider only; name,
  email, avatar from Google). Same origin as the SPA → first-party session cookie
  (`HttpOnly; Secure; SameSite=Lax`), works on Safari/iOS, no CORS.
  - Manual setup: Google OAuth client (Testing mode, test users), see `infra/README.md` §1.6.
  - Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (kind 3), `BETTER_AUTH_SECRET`
    (Terraform `random_password`, kind 2) — add with the `manage-secrets` skill.
  - WebSocket upgrade then also validates the session cookie (still with the `Origin` check).
- **Claim guest threads:** on first sign-in, threads/messages whose `creator_key`/`author_key`
  match this browser are linked to the new user.
- **Private threads + roles:** creator becomes **owner** (`threads.owner_id`); others join as
  **members** via **invite links** (32-byte token, only its SHA-256 stored, 7-day default
  expiry, revocable, optional max uses; accept is idempotent). Owner: share, remove members,
  retry, delete. Member: view, chat, leave. Non-member → `404`, member on owner action → `403`.
  Tables: `thread_members (thread_id, user_id, joined_at)`, `thread_invites (…token_hash,
  expires_at, revoked_at, max_uses, use_count…)`.
- **UI:** Share dialog (mobile bottom sheet), `/invite/:token` Join page, member avatars,
  "Owned by …" on shared cards; per-user limits replace per-IP ones.
- Decide then: whether public threads remain (e.g. a `visibility` column) or everything
  becomes private.

## Later ideas
- Invite by email; viewer (read-only) role; transfer ownership.
- "Ask across everything": embeddings + Upstash Vector for RAG over all threads.
- Tags, full-text search (Postgres `tsvector`), favorites/archive.
- PWA share target: share a link from your phone straight into the app.
- YouTube transcripts, PDFs.
- Cloudflare Turnstile on create/chat if bots appear.
