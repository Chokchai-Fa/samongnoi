# PLAN — samongnoi, step by step to the MVP

Execution plan for the read-later + AI threads app. **MVP has no authentication** — guest
identity per browser, all threads public, per-IP + global limits; sign-in and sharing come
after the MVP. **What** we build is in `docs/PRODUCT.md`;
**how** (stack, rules) is in `CLAUDE.md`; cloud setup details are in `infra/README.md`.
This file is the ordered to-do list — tick boxes as steps land on `main`.

Legend: 👤 you (manual / needs your accounts) · 🤖 Claude Code · ✅ done when…

## Status (2026-10-09)
- **Live:** https://app.samongnoi.workers.dev — empty app shell + `/api/health` on one Worker,
  infra (Neon, Upstash, Queue) managed by Terraform, CI/CD green, drift check "No changes".
- **Done:** Phase 0 (except 👤 local tool upgrades + branch protection) and Phase 1.
- **Done:** Phase 2 — guest identity + threads (merged, PR #6). The post-deploy check (👤 below)
  is still open.
- **Done:** Phase 3 — fetch → extract → AI summary, Link tab, polling, Retry and Delete for failed
  threads (merged, PR #7; CI fix in PR #8). Live AI and the 👤 links check need the deployed app.
- **Built, not merged** (branch `feat/phase-4-live-chat`): live chat in a thread — messages,
  streamed answers to every viewer, presence, typing, reconnects. The DO spike outcome is in
  `docs/PRODUCT.md`. Checks pass; the two-browser checks need a deploy.
- **Next:** merge Phase 4 and deploy, run its 👤 checks, then Phase 5.
- **Open 👤 items:** protect `main`; upgrade local Terraform to 1.16.x; enable Docker in WSL;
  check the live UI on phone + desktop; delete the Neon `test` project; Phase 4 two-browser,
  reload, phone-keyboard and airplane-mode checks.

## How we work
- One step ≈ one branch + PR (`feat/…`, `fix/…`, `infra/…`, `chore/…`, `docs/…`). CI must be
  green; merging to `main` deploys automatically (`deploy.yml`).
- Every PR that touches `infra/envs/**` or `infra/modules/**` gets a Terraform plan comment —
  read it before merging. Terraform is pinned to 1.16.5 (CI + `required_version`).
- Secrets: never in chat or git. 👤 fills `.secrets.env` (gitignored); 🤖 runs
  `scripts/verify-credentials.py` (statuses only), then `scripts/setup-github-secrets.sh`;
  🤖 wires names via the `manage-secrets` skill.
- **UI must be easy to use and modern.** Every UI step follows the `design-system` skill — its
  "UX principles" and "Modern visual style" guidelines — and passes its **UX review checklist**
  (task in ≤ 3 taps, one clear primary action, loading/empty/error states, instant feedback,
  375 / 768 / 1280px, light + dark, keyboard) before the PR is merged.
- Scope changes → update `docs/PRODUCT.md` in the same PR.

---

## Phase 0 — Accounts, repo, decisions (no code)

Decisions 👤 (record answers in `infra/README.md` §1.9):
- [x] GitHub repo name + **private or public** (public = unlimited Actions minutes + approval gates)
- [x] Cloudflare `workers.dev` subdomain `samongnoi`, Worker `app` → app URL `https://app.samongnoi.workers.dev`
- [x] Region for Neon + Upstash (closest to users)
- [x] HCP Terraform organization name

Setup — follow `infra/README.md` §1 in order:
- [ ] 👤 §1.1 local tools (Node 22, pnpm via corepack, Terraform 1.16.x, Docker, gh) — left: upgrade
      local Terraform 1.5.7 → 1.16.x, enable Docker WSL integration, `nvm alias default 22` (optional).
      Done: Node 22 installed via nvm, pnpm via corepack, gh logged in.
- [x] 🤖 `git init`, first commit of the planning docs; `gh repo create … --source . --push`
- [ ] 👤 §1.2 protect `main` (require PR + CI) — after CI exists (end of Phase 1)
- [x] 👤 §1.3 Cloudflare: account ID, subdomain, scoped API token
- [x] 👤 §1.4 HCP Terraform: org, workspace `samongnoi`, **Local execution mode**, token, `terraform login`
- [x] 👤 §1.5 Neon API key, Upstash API key (no projects/databases by hand)
- [ ] ~~👤 §1.6 Google OAuth client~~ — **skip until post-MVP auth**
- [x] 👤 §1.7 Gemini API key (AI Studio, free tier, no billing)
- [x] 👤 §1.8 `! scripts/setup-github-secrets.sh --repo <owner>/<repo>`
- [x] 🤖 `scripts/setup-github-secrets.sh --check` → all ✓
- [x] 🤖 `scripts/verify-credentials.py` → all ✓ (added in PR #4 after Phase 0 found: a
      Cloudflare account-ID typo, an HCP organization token that can't lock state, and the HCP
      workspace being named `samongnoi`, not `samongnoi-prod`)
- [ ] 👤 delete the Neon sign-up project `test` (Terraform manages only `samongnoi`)

✅ All 7 MVP secrets set (`--check` all ✓); you can sign in to every dashboard; the four decisions are recorded.

---

## Phase 1 — Scaffold: empty app deployed end-to-end

Goal: an empty but real app — SPA + `/api/health` on one Worker, deployed by CI, infra by
Terraform, local dev working. Everything later builds on this.

### 1.1 Monorepo tooling 🤖
- [x] `package.json` (`packageManager` pnpm pin), `pnpm-workspace.yaml`, `turbo.json`
      (tasks: build, dev, lint, typecheck, test; `env` for `VITE_*`), `.nvmrc`
- [x] `packages/config`: shared `tsconfig` (strict), ESLint (flat config), Prettier
- [x] Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `format`

### 1.2 `packages/shared` 🤖
- [x] Package setup + `health.schema.ts` as the first shared zod schema
- [x] Export pattern used by both apps (`@repo/shared`)

### 1.3 `apps/api` — the Worker 🤖
- [x] Hono app: `index.ts`, `app.ts` (single route chain → `AppType`), `GET /api/health`
- [x] `env.ts` (zod-validated env), `lib/errors.ts` + `app.onError`, `middleware/deps.ts`
- [x] `wrangler.toml`: name, `compatibility_date`, `nodejs_compat`, observability, `[vars]`,
      `[assets]` → `../web/dist` with SPA fallback + `run_worker_first = ["/api/*"]`,
      queue producer/consumer (consumer handler can be a no-op for now)
- [x] `wrangler types` → `worker-configuration.d.ts`; `AppType` export for the RPC client
- [x] Vitest + `@cloudflare/vitest-plugin` (renamed from vitest-pool-workers); tests for
      `/api/health`, JSON 404, queue consumer

### 1.4 Database & cache plumbing 🤖
- [x] Drizzle config, `db/client.ts` (Neon HTTP driver), `db/schema/index.ts`, `db:generate`
      / `db:migrate` scripts (no tables yet — first real table comes with auth)
- [x] `lib/cache.ts` (Upstash REST client), `lib/queue.ts` (`enqueue`)

### 1.5 `apps/web` — the SPA 🤖
- [x] Vite + React + TS, TanStack Router (file routes), TanStack Query, `lib/api-client.ts`
      (`hc<AppType>('/').api`, types via `api/app-type` declarations)
- [x] Tailwind v4 + shadcn init (`components.json`), `styles/globals.css` tokens (light + dark),
      `cn()`, ThemeProvider, fonts
- [x] Responsive app shell (top bar, container) + Home placeholder that calls `/api/health`
- [x] Vite dev proxy: `/api` → `localhost:8787` with `ws: true`

### 1.6 Local dev environment 🤖
- [x] `docker-compose.yml`: Postgres 17, Neon HTTP proxy, Redis 7, serverless-redis-http
      (images verified to exist; **not run yet** — Docker isn't enabled in WSL here)
- [x] `apps/api/.dev.vars.example`, `apps/web/.env.example`, `.envrc.example`
- [ ] 👤 enable Docker Desktop WSL integration; copy examples to real files;
      `docker compose up -d && pnpm dev` works (API + SPA already verified without Docker)

### 1.7 Terraform 🤖 (+ 👤 review plan)
- [x] `infra/envs/prod`: `versions.tf` (cloud block, pinned providers), `providers.tf`,
      `variables.tf`, `terraform.tfvars`, `main.tf`, `outputs.tf`, committed lock file
- [x] Modules: `neon_db`, `upstash_redis`, `queue` (`app_secrets` waits for post-MVP auth)
- [x] Outputs exactly: `database_url`, `upstash_redis_rest_url`, `upstash_redis_rest_token`,
      `queue_name`
- [x] 👤 locally: `terraform init && terraform validate && terraform plan` looks right

### 1.8 First deploy 🤖 + 👤
- [x] 👤 fill the Phase 0 placeholders first: `CHANGE-ME` in `apps/api/wrangler.toml`
      (`APP_URL` subdomain) and `infra/envs/prod/versions.tf` (HCP org); confirm regions in
      `terraform.tfvars`
- [x] PR with 1.1–1.7 → CI green + plan comment → 👤 review → merge (PR #1; Neon retention fix PR #2)
- [x] `deploy.yml`: infra applies → app builds → migrations → Worker deployed — live at https://app.samongnoi.workers.dev
- [x] 🤖 live checks: `/api/health` 200 (`env: production`), `/` + deep link serve the SPA,
      unknown `/api/*` → JSON 404, assets 200, Worker secrets present, drift run "No changes"
- [x] 🤖 pin Terraform 1.16.5 (PR #3) — local 1.5.7 showed phantom in-place updates
- [ ] 👤 open the live URL on phone + desktop; light/dark toggle works
- [ ] 👤 §1.2: now protect `main` (require PR + CI)

✅ `https://…workers.dev/` shows the shell (light/dark, mobile + desktop) ·
`/api/health` → 200 · deep links load the SPA · Worker secrets visible (names) in Cloudflare ·
Neon/Upstash/Queue exist · `pnpm dev` works locally.

- [x] 🤖 **Template upkeep:** scaffold + all fixes copied into `~/dev/project-template` with
      `__PROJECT_NAME__` / `CHANGE-ME` placeholders; generic `PLAN.md`; smoke-tested (fresh
      project with a 39-char name: install, format, lint, typecheck, test, build,
      `terraform validate` with 1.16.5).

### Done log (Phase 0–1)
| PR | What |
|----|------|
| #1 | Phase 1 scaffold (monorepo, Worker + SPA, Terraform, CI, local dev); CI fixes: `contents: read` for private repos, turbo build cycle, plan skips without secrets |
| #2 | Neon `history_retention_seconds = 21600` (provider default 24 h exceeds the free plan) |
| #3 | Pin Terraform 1.16.5 everywhere; Phase 0 + first deploy ticked |
| #4 | `scripts/verify-credentials.py`; Phase 0 lessons + troubleshooting table in `infra/README.md` |

---

## Phase 2 — Guest identity + threads (text only, no AI yet)

- [x] 🤖 Guest identity: web `useGuest` (clientId + name in localStorage, rename menu),
      `api-client` sends `X-Client-Id` / `X-Client-Name` (name URL-encoded so Thai survives
      HTTP headers); api `middleware/guest.ts` (validate, `key = sha256(clientId)`),
      `middleware/client-ip.ts`; `guest.schema.ts`
- [x] 🤖 Schema + migration: `threads` (creator_key, creator_name, source_type, content, status, …)
      → `apps/api/drizzle/0000_threads.sql`; applied on deploy by `deploy.yml`
- [x] 🤖 `threads.routes/service/repository`: create (text), list all (cursor), get, delete
      (creator browser only → else 403); responses expose `isMine`, never raw ids
- [x] 🤖 Shared schemas in `packages/shared/threads.schema.ts`
- [x] 🤖 Reusable UI patterns first (design-system skill): `PageHeader`, `EmptyState` (icon +
      one-line explanation + primary action), card skeletons, toasts (`sonner`), undo toast.
      No `ConfirmDialog`: delete uses the undo toast, as `docs/PRODUCT.md` specifies
- [x] 🤖 Web: Home (all threads, "by …" + "Mine" badge, empty state, "Load more", FAB on
      mobile), New page (text form + public-content notice; the Link tab with tabs comes in
      Phase 3), Thread page (header + content, Copy link), delete from the ⋯ menu (Mine only)
      with a 5 s undo toast
- [x] 🤖 Tests: service unit tests (fake deps, in-memory repository); route tests incl. delete
      from another clientId → 403, missing/invalid headers → 400
- [ ] 👤 after deploy: in two browsers, create and open a thread; both see both threads; only
      the creator sees Delete; check on a phone and a desktop

✅ Create/list/open text threads on prod from two browsers; both see everything; only the
creating browser can delete; layouts match `docs/PRODUCT.md` at 375/768/1280.

---

## Phase 3 — Pipeline: fetch → extract → AI summary

- [x] 🤖 `GEMINI_API_KEY` wiring (`manage-secrets`, kind 3): the GitHub secret and the
      `deploy.yml` entry already existed; added the zod env field, a dev placeholder, and the test
      binding
- [x] 🤖 `lib/ai.ts`: Gemini Flash primary, Workers AI fallback (`[ai]` binding), one place for
      models. Uses `generateText` + `Output.object` (`generateObject` is deprecated in AI SDK v7)
- [x] 🤖 `lib/fetch-page.ts` (http(s) only, 10 s, 3 redirects, 1 MB, html/text only, no private
      addresses) and `lib/extract.ts` (HTMLRewriter: title, Open Graph, article text)
- [x] 🤖 `summarize.service.ts` + `jobs/queue-handler.ts`: idempotent, status transitions,
      summary + key points + suggested questions; retries with backoff, then `failed` with Retry
- [x] 🤖 New page Link tab (drafts kept across tabs); Home polls every 3 s while anything is
      pending; pending/failed cards; Retry and Delete for the creator browser
- [x] 🤖 Tests: extract on fixture HTML (real HTMLRewriter), fetch limits and redirects, pipeline
      with fake AI/fetch, failure paths and retry rules
- [ ] 👤 try ~10 real links (news, blog, docs, a bad URL) on the deployed app

✅ A pasted link becomes a ready thread with a good summary in < ~30 s; bad links fail
gracefully with Retry; Gemini outage/429 falls back to Workers AI.

---

## Phase 4 — Live chat

- [x] 🤖 **Spike first** (throwaway branch, local only): ThreadRoom DO with WebSocket Hibernation,
      `Origin` check on upgrade, a ~27 s stream to two sockets; the POST returned while generation
      ran on. Outcome in `docs/PRODUCT.md` → "Spike outcome (phase 4)".
- [x] 🤖 `messages` table (author_key, author_name, error) + migration `0001`; `chat.service.ts`
      (prompt with summary/content/history, injection guards); `POST /threads/:id/messages`, `GET …/messages`
- [x] 🤖 ThreadRoom DO: sockets, presence (guest names), typing, serialized `ask()`, broadcast
      events incl. `thread.deleted`; `wrangler.toml` DO binding + migration `v1`
- [x] 🤖 Shared `realtime.schema.ts`; web `useThreadRoom` (reconnect/backoff, refetch on reconnect,
      visibility reconnect, polling fallback while the socket is down)
- [x] 🤖 Thread page: chat UI, streaming message, suggested questions, two-pane desktop, stacked
      mobile with sticky input. Left for Phase 5: summary auto-collapse and presence avatars on phones
- [x] 🤖 Tests: chat service with fake AI; DO event flow over real sockets (`realtime.test.ts`:
      presence, typing, delete, a streamed answer to two viewers, leaving without a close code)
- [ ] 👤 two-browser, reload-mid-answer, phone-keyboard and airplane-mode checks on the deployed app
      (checklist in `docs/PRODUCT.md` → "Spike outcome (phase 4)")

✅ Two browsers in one thread see each other's questions and the AI's streamed answer live; reload mid-answer shows the right state; works on a
phone with the keyboard open; airplane-mode toggle reconnects cleanly.

---

## Phase 5 — Limits & polish → MVP

- [ ] 🤖 UX pass on every screen with the design-system **UX review checklist**; fix anything
      that needs more than 3 taps, lacks feedback, or reads unclear; consistent spacing/type;
      also the Phase 4 leftovers: summary auto-collapse on phones, presence avatars in the mobile top bar
- [ ] 👤 5-minute hallway test: a friend saves a link and asks a question without help — note
      every hesitation and fix the top issues

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
- DO behaviour for long-running AI streams — settled locally by the Phase 4 spike; confirm on the
  deployed Worker (checklist in `docs/PRODUCT.md`).
- Workers 10 ms CPU on large pages — **not measured yet**: this container has no Cloudflare
  runtime. Measure on the deployed Worker with a few large pages; lower the 1 MB cap if needed.
- Gemini model id (`gemini-3.5-flash` in `lib/ai.ts`) — sources disagree on 2.5 Flash's
  retirement date. Confirm the id in AI Studio before relying on it; Workers AI covers failures.
- The Workers AI binding runs only against Cloudflare, even in dev. `pnpm dev` and the tests use
  `apps/api/.local-wrangler.toml` (generated from `wrangler.toml` without `[ai]`), so locally only
  Gemini summarizes.
- Not built yet (Phase 5): per-IP and global caps for create and retry, and the 24 h cache of
  recent URL fetches. Request bodies are not size-capped before JSON parsing either.
- **Public, unauthenticated MVP**: anyone with the URL can post and chat. Per-IP + global caps
  protect quotas, but content is not private and could be spammed — don't advertise the URL
  until Phase 5 limits are live.
