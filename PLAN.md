# PLAN — samongnoi, step by step to the MVP

Execution plan for the read-later + AI threads app. **MVP has no authentication** — guest
identity per browser, all threads public, per-IP + global limits; sign-in and sharing come
after the MVP. **What** we build is in `docs/PRODUCT.md`;
**how** (stack, rules) is in `CLAUDE.md`; cloud setup details are in `infra/README.md`.
This file is the ordered to-do list — tick boxes as steps land on `main`.

Legend: 👤 you (manual / needs your accounts) · 🤖 Claude Code · ✅ done when…

## How we work
- One step ≈ one branch + PR (`feat/…`, `infra/…`, `chore/…`). CI must be green; merging to
  `main` deploys automatically (`deploy.yml`).
- Every PR that touches `infra/**` gets a Terraform plan comment — read it before merging.
- Secrets: never in chat or git. 👤 sets values with `scripts/setup-github-secrets.sh`;
  🤖 wires names via the `manage-secrets` skill.
- UI work follows the `design-system` skill and is checked at 375 / 768 / 1280px.
- Scope changes → update `docs/PRODUCT.md` in the same PR.

---

## Phase 0 — Accounts, repo, decisions (no code)

Decisions 👤 (record answers in `infra/README.md` §1.9):
- [ ] GitHub repo name + **private or public** (public = unlimited Actions minutes + approval gates)
- [ ] Cloudflare `workers.dev` subdomain → app URL `https://samongnoi.<subdomain>.workers.dev`
- [ ] Region for Neon + Upstash (closest to users)
- [ ] HCP Terraform organization name

Setup — follow `infra/README.md` §1 in order:
- [ ] 👤 §1.1 local tools (Node LTS, pnpm via corepack, Terraform ≥ 1.6, Docker, gh)
- [ ] 🤖 `git init`, first commit of the planning docs; `gh repo create … --source . --push`
- [ ] 👤 §1.2 protect `main` (require PR + CI) — after CI exists (end of Phase 1)
- [ ] 👤 §1.3 Cloudflare: account ID, subdomain, scoped API token
- [ ] 👤 §1.4 HCP Terraform: org, workspace `samongnoi-prod`, **Local execution mode**, token, `terraform login`
- [ ] 👤 §1.5 Neon API key, Upstash API key (no projects/databases by hand)
- [ ] ~~👤 §1.6 Google OAuth client~~ — **skip until post-MVP auth**
- [ ] 👤 §1.7 Gemini API key (AI Studio, free tier, no billing)
- [ ] 👤 §1.8 `! scripts/setup-github-secrets.sh --repo <owner>/<repo>`
- [ ] 🤖 `scripts/setup-github-secrets.sh --check` → all ✓

✅ All 7 MVP secrets set (`--check` all ✓); you can sign in to every dashboard; the four decisions are recorded.

---

## Phase 1 — Scaffold: empty app deployed end-to-end

Goal: an empty but real app — SPA + `/api/health` on one Worker, deployed by CI, infra by
Terraform, local dev working. Everything later builds on this.

### 1.1 Monorepo tooling 🤖
- [ ] `package.json` (`packageManager` pnpm pin), `pnpm-workspace.yaml`, `turbo.json`
      (tasks: build, dev, lint, typecheck, test; `env` for `VITE_*`), `.nvmrc`
- [ ] `packages/config`: shared `tsconfig` (strict), ESLint (flat config), Prettier
- [ ] Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `format`

### 1.2 `packages/shared` 🤖
- [ ] Package setup + `health.schema.ts` as the first shared zod schema
- [ ] Export pattern used by both apps (`@repo/shared`)

### 1.3 `apps/api` — the Worker 🤖
- [ ] Hono app: `index.ts`, `app.ts`, `routes/index.ts`, `GET /api/health`
- [ ] `env.ts` (zod-validated env), `lib/errors.ts` + `app.onError`, `middleware/deps.ts`
- [ ] `wrangler.toml`: name, `compatibility_date`, `nodejs_compat`, observability, `[vars]`,
      `[assets]` → `../web/dist` with SPA fallback + `run_worker_first = ["/api/*"]`,
      queue producer/consumer (consumer handler can be a no-op for now)
- [ ] `wrangler types` → `worker-configuration.d.ts`; `AppType` export for the RPC client
- [ ] Vitest + `@cloudflare/vitest-pool-workers`; test for `/api/health`

### 1.4 Database & cache plumbing 🤖
- [ ] Drizzle config, `db/client.ts` (Neon HTTP driver), `db/schema/index.ts`, `db:generate`
      / `db:migrate` scripts (no tables yet — first real table comes with auth)
- [ ] `lib/cache.ts` (Upstash REST client), `lib/queue.ts` (`enqueue`)

### 1.5 `apps/web` — the SPA 🤖
- [ ] Vite + React + TS, TanStack Router (file routes), TanStack Query, `lib/api-client.ts`
      (`hc<AppType>('/api')`)
- [ ] Tailwind v4 + shadcn init (`components.json`), `styles/globals.css` tokens (light + dark),
      `cn()`, ThemeProvider, fonts
- [ ] Responsive app shell (top bar, container) + Home placeholder that calls `/api/health`
- [ ] Vite dev proxy: `/api` → `localhost:8787` with `ws: true`

### 1.6 Local dev environment 🤖
- [ ] `docker-compose.yml`: Postgres 17, Neon HTTP proxy, Redis 7, serverless-redis-http
      (verify image names/versions — see `infra/README.md` §5)
- [ ] `apps/api/.dev.vars.example`, `apps/web/.env.example`, `.envrc.example`
- [ ] 👤 copy examples to real files; `docker compose up -d && pnpm dev` works

### 1.7 Terraform 🤖 (+ 👤 review plan)
- [ ] `infra/envs/prod`: `versions.tf` (cloud block, pinned providers), `providers.tf`,
      `variables.tf`, `terraform.tfvars`, `main.tf`, `outputs.tf`, committed lock file
- [ ] Modules: `neon_db`, `upstash_redis`, `queue` (`app_secrets` waits for post-MVP auth)
- [ ] Outputs exactly: `database_url`, `upstash_redis_rest_url`, `upstash_redis_rest_token`,
      `queue_name`
- [ ] 👤 locally: `terraform init && terraform validate && terraform plan` looks right

### 1.8 First deploy 🤖 + 👤
- [ ] PR with 1.1–1.7 → CI green + plan comment → 👤 review → merge
- [ ] `deploy.yml`: infra applies → app builds → migrations → Worker deployed
- [ ] 👤 §1.2: now protect `main` (require PR + CI)

✅ `https://…workers.dev/` shows the shell (light/dark, mobile + desktop) ·
`/api/health` → 200 · deep links load the SPA · Worker secrets visible (names) in Cloudflare ·
Neon/Upstash/Queue exist · `pnpm dev` works locally.

**Template upkeep:** copy the working scaffold back into `~/dev/project-template` (replace
`samongnoi` with `__PROJECT_NAME__`) so future projects start with code.

---

## Phase 2 — Guest identity + threads (text only, no AI yet)

- [ ] 🤖 Guest identity: web `useGuest` (clientId + name in localStorage, rename menu),
      `api-client` sends `X-Client-Id` / `X-Client-Name`; api `middleware/guest.ts`
      (validate, `key = sha256(clientId)`), `middleware/client-ip.ts`; `guest.schema.ts`
- [ ] 🤖 Schema + migration: `threads` (creator_key, creator_name, source_type, content, status, …)
- [ ] 🤖 `threads.routes/service/repository`: create (text), list all (cursor), get, delete
      (creator browser only → else 403); responses expose `isMine`, never raw ids
- [ ] 🤖 Shared schemas in `packages/shared/threads.schema.ts`
- [ ] 🤖 Web: Home (all threads, "by …" + "Mine" badge, empty state, FAB on mobile), New page
      (Text tab + public-content notice), Thread page (header + content, Copy link), delete
      with confirm (only on Mine)
- [ ] 🤖 Tests: service unit tests (fake deps); route tests incl. delete from another
      clientId → 403, missing/invalid headers → 400

✅ Create/list/open text threads on prod from two browsers; both see everything; only the
creating browser can delete; layouts match `docs/PRODUCT.md` at 375/768/1280.

---

## Phase 3 — Pipeline: fetch → extract → AI summary

- [ ] 🤖 Add `GEMINI_API_KEY` wiring via `manage-secrets` (already set as a GitHub secret in Phase 0)
- [ ] 🤖 `lib/ai.ts`: Gemini Flash primary, Workers AI fallback (`[ai]` binding), one place for models
- [ ] 🤖 `lib/fetch-page.ts` (limits: http(s), 10 s, 3 redirects, 1 MB, html/text only) and
      `lib/extract.ts` (HTMLRewriter)
- [ ] 🤖 `summarize.service.ts` + `jobs/queue-handler.ts`: idempotent, status transitions,
      `generateObject` → summary, key points, suggested questions; retries → `failed`
- [ ] 🤖 New page Link tab; Home polling while pending; pending/failed cards + Retry (creator
      browser only)
- [ ] 🤖 Tests: extract on fixture HTML, pipeline with fake AI/fetch, failure paths
- [ ] 👤 try ~10 real links (news, blog, docs, a bad URL)

✅ A pasted link becomes a ready thread with a good summary in < ~30 s; bad links fail
gracefully with Retry; Gemini outage/429 falls back to Workers AI.

---

## Phase 4 — Live chat

- [ ] 🤖 **Spike first** (throwaway branch): ThreadRoom DO with WebSocket Hibernation, `Origin`
      check on upgrade, stream AI tokens to two browsers; confirm generation continues
      after `ask()` returns (else POST awaits generation). Record the outcome in `docs/PRODUCT.md`.
- [ ] 🤖 `messages` table (author_key, author_name) + migration; `chat.service.ts` (prompt with summary/content/history,
      injection guards); `POST /threads/:id/messages`, `GET …/messages`
- [ ] 🤖 ThreadRoom DO: sockets, presence (guest names), typing, serialized `ask()`, broadcast
      events incl. `thread.deleted`;
      `wrangler.toml` DO binding + migration `v1`
- [ ] 🤖 Shared `realtime.schema.ts`; web `useThreadRoom` (reconnect/backoff, refetch on
      reconnect, visibility reconnect, polling fallback)
- [ ] 🤖 Thread page: chat UI, streaming message, suggested questions, two-pane desktop /
      collapsible summary + sticky input on mobile
- [ ] 🤖 Tests: chat service with fake AI; DO event flow test where feasible

✅ Two browsers in one thread see each other's questions and the AI's streamed answer live; reload mid-answer shows the right state; works on a
phone with the keyboard open; airplane-mode toggle reconnects cleanly.

---

## Phase 5 — Limits & polish → MVP

- [ ] 🤖 `rate-limit.service.ts` (Redis): per-IP + global daily caps for create / ask / retry
      (numbers in `docs/PRODUCT.md` → "Abuse protection") → friendly `429` UI
- [ ] 🤖 Empty/error/loading states everywhere, toasts, error boundaries per route
- [ ] 🤖 Responsive + accessibility pass at 375/768/1280, dark mode, keyboard navigation
- [ ] 🤖 Observability: structured logs with request id; check free-tier usage dashboards
- [ ] 👤 Dogfood for a week with a friend; note issues in GitHub issues
- [ ] 👤 Decide whether the public URL needs Turnstile before sharing it widely

✅ **MVP done** — usable daily on phone and desktop, inside every free tier, and a public URL
can't exhaust the quotas.

---

## Post-MVP phase A — Sign in with Google

Design notes: `docs/PRODUCT.md` → "Post-MVP: auth & sharing".
- [ ] 👤 `infra/README.md` §1.6 Google OAuth client → secrets `GOOGLE_CLIENT_ID/SECRET` via the script
- [ ] 🤖 `manage-secrets`: wire `GOOGLE_CLIENT_*` (kind 3) + `BETTER_AUTH_SECRET`
      (`app_secrets` module, kind 2)
- [ ] 🤖 Better Auth on `/api/auth/*` + its tables; `c.var.user`; `/login`; session in the WS upgrade
- [ ] 🤖 Claim guest threads/messages matching this browser's `creator_key` on first sign-in
- [ ] 🤖 Decide + implement: public vs private threads; per-user limits replace per-IP

✅ Sign in/out works on Safari/iOS and Chrome; guest threads are claimed.

## Post-MVP phase B — Private threads & sharing
- [ ] 🤖 `owner_id`, `thread_members`, `thread_invites` (+ migrations: expand → backfill → contract)
- [ ] 🤖 Access service (owner/member, 404/403), invites (hashed tokens, expiry, revoke),
      remove/leave → DO closes sockets
- [ ] 🤖 Share dialog / bottom sheet, `/invite/:token` Join page, member avatars
- [ ] 👤 test with a second Google account (add as OAuth test user)

✅ Owner invites a friend by link; non-members can't see private threads.

## After that
- [ ] Copy improvements back to `~/dev/project-template` (patterns, limits, skills)
- [ ] Pick from `docs/PRODUCT.md` → "Later ideas" (email invites, viewer role, cross-thread
      RAG with Upstash Vector, tags/search, PWA share target, PDFs/YouTube, Turnstile)

## Open questions / risks
- Exact free-tier numbers drift (Gemini, Workers AI, Queues) — re-check when a limit is hit.
- Docker image names for the local Neon HTTP proxy and serverless-redis-http — verify in 1.6.
- DO behaviour for long-running AI streams — settled by the Phase 4 spike.
- Workers 10 ms CPU on large pages — measured in Phase 3; lower the 1 MB cap if needed.
- **Public, unauthenticated MVP**: anyone with the URL can post and chat. Per-IP + global caps
  protect quotas, but content is not private and could be spammed — don't advertise the URL
  until Phase 5 limits are live.
