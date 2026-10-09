# CLAUDE.md — samongnoi

Guidance for Claude Code working in this monorepo.

## Project goal

A full-stack TypeScript monorepo (frontend + backend + infrastructure) that runs **entirely on
free-tier cloud services that do not require a credit card**. All cloud resources are declared
in Terraform under `infra/` — nothing is created by hand in a provider dashboard unless the
provider has no Terraform support (document any such step in `infra/README.md`).

**Hard constraint:** never introduce a service, plan, or resource that needs a credit card or
leaves the free tier. If a feature seems to need one, stop and ask first.

**The app (POC): read-later with AI threads.** Save a link or pasted text → a queue job fetches
it and writes an AI summary → it becomes a thread you can open and chat with about that source.
**MVP has no authentication**: guest identity per browser, all threads visible to everyone,
everyone viewing a thread shares one live chat (WebSocket via a Durable Object per thread), and
per-IP + global daily limits protect the free quotas. Google sign-in and private/shared threads
come after the MVP — don't add auth code until `PLAN.md` reaches that phase. Full spec — flow, guest identity, limits, data model, API, realtime
events, pipeline/chat rules, responsive layouts, build phases — is in **`docs/PRODUCT.md`**. Read it before working on any feature, and keep it updated
when scope or the API changes.

**What to do next:** `PLAN.md` is the ordered step-by-step plan (MVP phases 0–5 then post-MVP phases, with checkboxes,
owner 👤/🤖, and done criteria). Work on the next unchecked step, and tick boxes in the PR that
completes them.

## Service stack (free tier, no credit card — checked Oct 2026)

| Concern          | Provider                          | Free-tier limits to respect                                                  | Terraform provider          |
|------------------|-----------------------------------|-------------------------------------------------------------------------------|-----------------------------|
| App hosting      | **One** Cloudflare Worker: Hono API on `/api/*` + SPA via **Workers Static Assets** | API: 100K requests/day, **10 ms CPU/request**, 3 MB compressed bundle. Static asset requests are free and don't count | none (deployed by wrangler) |
| Queue / jobs     | Cloudflare Queues                 | 10,000 operations/day (~3 per message), 24 h retention                        | `cloudflare/cloudflare`     |
| AI (primary)     | Google Gemini API (Flash only)    | ~1,500 req/day; free-tier prompts may be used for training                    | none (`GEMINI_API_KEY` secret) |
| AI (fallback)    | Cloudflare Workers AI (binding)   | **10,000 Neurons/day**, resets 00:00 UTC                                      | none (wrangler `[ai]` binding) |
| Realtime         | Durable Objects (SQLite-backed)   | 100K requests/day on Free; use WebSocket Hibernation                          | none (wrangler `durable_objects`) |
| Postgres         | Neon (serverless HTTP driver)     | 0.5 GB/project, 100 CU-hrs/month, scales to zero                              | `kislerdm/neon` (community) |
| Cache            | Upstash Redis (REST)              | 256 MB, 500K commands/month                                                   | `upstash/upstash`           |
| Terraform state  | HCP Terraform (Free)              | 500 managed resources, 1 concurrent run; workspace in Local execution mode    | built-in `cloud {}` block   |
| CI/CD            | GitHub Actions                    | Free minutes                                                                  | —                           |

Fallback for queues if the Cloudflare Queues free quota is too small: Upstash QStash (HTTP push).

Do **not** use:
- **Koyeb** — requires a credit card since Feb 2026. **Fly.io** — no free tier for new accounts.
- **Cloudflare Containers, R2, Workers Paid features** — need the paid plan / a payment method.
- **Cloudflare Pages / a separate frontend origin** — web and API must share one origin so the
  (post-MVP) Better Auth session cookie is first-party (Safari/iOS block cross-site cookies),
  no CORS is needed, and the WebSocket `Origin` check is simple. The SPA is served by the same Worker as the API.
- **Render Postgres** — free instances expire after 30 days.
- Node-only frameworks/libraries on the backend (NestJS, Express, Fastify, `pg`/`pgx`-style TCP
  drivers, native modules) — they don't fit the Workers runtime or the 3 MB bundle limit.

## Repository layout

```
.
├── apps/
│   ├── web/                # Vite + React + TS SPA → built to dist/, served by the api Worker
│   └── api/                # The Worker: Hono API on /api/* + static assets from ../web/dist
├── packages/
│   ├── shared/             # zod schemas + DTO types shared by web and api (API contract)
│   └── config/             # shared tsconfig / eslint / prettier presets
├── infra/
│   ├── modules/            # queue, neon_db, upstash_redis, secrets (random_password)
│   ├── envs/prod/          # root module: providers, cloud{} backend, module wiring
│   └── README.md           # one-time manual steps: account sign-up, API tokens
├── .github/                # workflows (ci, deploy, drift) + composite actions (setup, terraform-outputs)
├── PLAN.md                 # step-by-step execution plan (phases, checkboxes)
├── docs/PRODUCT.md          # product spec: flow, data model, API, responsive layouts, phases
├── .claude/skills/         # project skills for Claude Code (manage-secrets, design-system)
├── pnpm-workspace.yaml
├── turbo.json
└── CLAUDE.md
```

## Tooling

- **pnpm** workspaces + **Turborepo**. Node.js LTS pinned in `.nvmrc`. TypeScript `strict`.
- Backend: **Hono**, **zod** (`@hono/zod-validator`, `@hono/zod-openapi`), **Drizzle ORM** with
  `@neondatabase/serverless` (HTTP), `@upstash/redis`, **Better Auth** (post-MVP), **Wrangler** for local
  dev and deploy. AI via the **Vercel AI SDK** (`ai`, `@ai-sdk/google`, `workers-ai-provider`,
  optional `@ai-sdk/groq`) — providers/models/fallback live only in `src/lib/ai.ts`.
- Frontend: **Vite + React** (not Next.js — hosting is static-only), **TanStack Router**
  (file-based, type-safe), **TanStack Query** over the Hono RPC client (`hc<AppType>`),
  **Tailwind CSS + shadcn/ui**, **react-hook-form** + zod.
- Tests: **Vitest**; API integration tests use `@cloudflare/vitest-pool-workers`.
- Terraform >= 1.6; pin every provider version in `required_providers`.

## Common commands

```bash
pnpm install                       # install all workspaces
pnpm dev                           # web (vite) + api (wrangler dev) via turbo
pnpm build | lint | typecheck | test
pnpm --filter api db:generate      # drizzle-kit: generate migration from schema
pnpm --filter api db:migrate       # apply migrations to DATABASE_URL

cd infra/envs/prod
terraform fmt -recursive && terraform validate
terraform plan                     # always review before apply
terraform apply                    # only when the user explicitly asks
```

Deployment split: **Terraform owns resources** (Queues, Neon, Upstash, generated secrets);
**Wrangler deploys the single Worker** (API code + SPA static assets) and uploads Worker
secrets from CI. Terraform
never manages the Worker script itself (it would fight wrangler). Bindings in
`apps/api/wrangler.toml` must match the resource names Terraform creates.

Local dev uses `docker compose` (Postgres + a Neon HTTP proxy, Redis + an Upstash-compatible
REST proxy) and `wrangler dev`, so free-tier quotas aren't burned during development. Setup,
manual cloud steps (accounts, tokens, Google OAuth, Gemini key), Terraform layout, and the
first-deploy order are in **`infra/README.md`**.

## Backend architecture (`apps/api`) — layered (routes → services → repositories)

The API is **one Worker** organised by technical layer. Each layer has one job, and calls only
flow downward: `routes → services → repositories → db`. A feature (e.g. users) is one file per
layer, named after the feature.

```
apps/api/src/
├── index.ts                 # Worker entry: export default { fetch: app.fetch, queue }
├── app.ts                   # create Hono app, global middleware, mount routers, onError
├── env.ts                   # Env bindings type (`wrangler types`) + zod-validated config
├── routes/                  # HTTP layer (Hono routers)
│   ├── index.ts             # mounts all routers: app.route('/users', usersRoutes) ...
│   ├── users.routes.ts
│   └── orders.routes.ts
├── services/                # business logic (plain functions)
│   ├── users.service.ts
│   └── orders.service.ts
├── repositories/            # data access — the only layer that touches Drizzle
│   ├── users.repository.ts
│   └── orders.repository.ts
├── db/
│   ├── client.ts            # getDb(env) → Drizzle + Neon HTTP driver
│   ├── schema/              # Drizzle tables: users.ts, orders.ts, index.ts (re-exports)
│   └── migrations/          # generated by drizzle-kit — do not edit by hand
├── middleware/              # auth, request-id, logger, deps (builds `deps` per request)
├── durable-objects/         # ThreadRoom: per-thread WebSockets (hibernation), presence, AI fan-out
│                            #   transport only — calls services, never Drizzle directly
├── jobs/
│   ├── queue-handler.ts     # Workers `queue()` consumer: validate message → call a service
│   └── messages.ts          # zod schemas for queue payloads
├── lib/
│   ├── errors.ts            # AppError, NotFoundError, ValidationError, ConflictError, ...
│   ├── cache.ts             # Upstash Redis client + helpers (always set TTL)
│   └── queue.ts             # enqueue(message) → Cloudflare Queues binding
└── types/                   # shared backend types (Deps, AppContext)
tests/                       # mirrors src/: services/*.test.ts, routes/*.test.ts
```

### Layer rules
- **routes/** — HTTP only: validate params/body/query with `zValidator` (schemas from
  `packages/shared`), call a service with `c.var.deps`, return `c.json(...)`. No business logic,
  no Drizzle, no cache calls.
- **services/** — all business logic as plain exported functions. Never import Hono or touch
  `Context`, never return HTTP status codes; throw `AppError` subclasses instead. Services may
  call other services and any repository.
- **repositories/** — the only place that imports Drizzle or `db/schema`. One function per
  query (`findById`, `create`, `listByUser`...), returning plain typed objects. No business rules.
- **db/** — table definitions and the client factory only.
- Imports never go upward (a repository never imports a service; a service never imports a
  route). Repositories don't call each other — compose in the service.

### Dependency passing
- No DI framework. `middleware/deps.ts` builds `deps = { db, cache, queue }` from `c.env` once
  per request and stores it in `c.var.deps` (clients are created lazily, keep it cheap).
- Service signature convention: `export async function createUser(deps: Deps, input: CreateUserInput)`.
- Repositories take `db` as first argument: `findUserByEmail(db, email)`.
- Tests pass fake `deps` (in-memory repo/cache) into services — no mocking framework needed.

### Errors
- `lib/errors.ts` defines `AppError` subclasses with a `code` and HTTP-agnostic meaning.
- `app.onError` in `app.ts` is the **only** place mapping `AppError` → HTTP status + JSON body
  `{ error: { code, message } }`. Unknown errors → 500 with no internal details leaked.

### Async work
- Services enqueue background work via `lib/queue.ts`; the same Worker consumes it in
  `jobs/queue-handler.ts`, which validates the payload with zod and calls a service.
  Handlers must be idempotent (messages can be retried).

### Workers constraints to design for
- 10 ms CPU per request: no heavy CPU work in requests; push it to the queue or avoid it.
- Keep the bundle under 3 MB compressed: check `wrangler deploy --dry-run --outdir dist`
  size before adding a dependency; prefer Web-standard, edge-compatible libraries.
- No TCP sockets: Postgres via Neon's HTTP driver, Redis via Upstash REST.
- Use `c.executionCtx.waitUntil()` for fire-and-forget work after responding.

## Frontend (`apps/web`) — Vite + React SPA

Static SPA build only (no SSR, no Next.js). The api Worker serves `apps/web/dist` via Workers
Static Assets on the **same origin** as the API — asset requests are free and don't consume the
Workers request quota, cookies are first-party, and there is no CORS. Unknown paths fall back to
`index.html` (SPA routing); only `/api/*` runs the Worker.
If public SEO pages are needed later, add a separate
Astro site rather than converting this app.

```
apps/web/src/
├── main.tsx                 # mounts QueryClientProvider + RouterProvider
├── routes/                  # TanStack Router file-based routes (thin: compose features)
├── features/<feature>/
│   ├── api/                 # query/mutation hooks: useUsers(), useCreateUser() (TanStack Query)
│   ├── components/          # feature-specific UI
│   └── hooks/               # feature-specific non-data hooks
├── components/ui/           # shadcn/ui primitives (design-system layer, see below)
├── components/              # shared composed components (layout, nav, PageHeader, EmptyState)
├── styles/globals.css       # design tokens (Tailwind v4 @theme + CSS variables, light/dark)
└── lib/
    ├── api-client.ts        # single `hc<AppType>('/api')` instance — same origin, relative URLs
    ├── query-client.ts      # TanStack Query defaults (retry, staleTime)
    └── utils.ts             # cn() = clsx + tailwind-merge
```

- All server data goes through TanStack Query hooks in `features/*/api/` — components never
  call the API client or `fetch` directly, and server data is not copied into React state.
- Route files stay thin: loaders/params + composing feature components. No business logic.
- Import request/response types and zod schemas from `packages/shared`; the only allowed
  import from `apps/api` is `import type { AppType }`.
- Forms: react-hook-form with `zodResolver` using the shared schemas.
- Config only via `import.meta.env.VITE_*` (validated with zod in `lib/env.ts`); anything
  `VITE_*` is public — never put secrets there.
- Handle API cold paths gracefully: loading skeletons, error boundaries per route.

### Design system — Tailwind CSS v4 + shadcn/ui

**Use the `design-system` skill** (`.claude/skills/design-system/SKILL.md`) for any change to
tokens, `components/ui/*`, variants, or when building new shared UI.

Stack: Tailwind v4 (CSS-first config, no `tailwind.config.js`), shadcn/ui (Radix primitives,
source owned in `components/ui/`, config in `apps/web/components.json`), `class-variance-authority`
for variants, `lucide-react` icons, `sonner` toasts, self-hosted fonts via `@fontsource-variable/*`.
App-type add-ons, only when needed: TanStack Table (data tables), shadcn Charts / Recharts
(charts), `motion` (animation), `react-day-picker` (dates, via shadcn Calendar).

Three layers — a component may only use layers below it:
1. **Tokens** — `styles/globals.css`: semantic CSS variables (`--background`, `--foreground`,
   `--primary`, `--muted`, `--destructive`, `--border`, `--ring`, `--radius`, `--chart-1..5`) in
   OKLCH, defined for `:root` (light) **and** `.dark`, exposed to Tailwind via `@theme inline`.
2. **Primitives** — `components/ui/*`: shadcn components. Generic, no business logic, no data
   fetching, no feature imports.
3. **Composed** — `components/*` (shared) and `features/*/components` (feature-specific): built
   only from primitives + tokens.

Rules:
- **Semantic tokens only**: `bg-primary`, `text-muted-foreground`, `border-border`, `rounded-lg`.
  Never raw palette classes (`bg-blue-500`), hex/rgb values, or inline `style` colors.
- Avoid arbitrary values (`w-[137px]`, `text-[13px]`); use the Tailwind scale. If a value repeats,
  make it a token.
- Reuse before creating: check `components/ui/` and `components/` first; add missing primitives
  with `pnpm --filter web dlx shadcn@latest add <name>`, never by hand-copying from the website.
- Variants via `cva` inside the component (`variant`, `size`), not ad-hoc className branches at
  call sites. Merge classes with `cn()`; every component accepts and forwards `className`.
- Dark mode via the `.dark` class on `<html>` (ThemeProvider, respects system preference);
  every token must have a dark value — never `dark:` overrides with raw colors.
- Accessibility: keep Radix semantics; every input has a `<Label>`; icon-only buttons get
  `aria-label`; visible `focus-visible` ring; text contrast WCAG AA (4.5:1) in both themes.
- **Responsive is required — mobile and desktop are both first-class.** Write mobile-first
  (base = phone, then `md:` ≥768px, `lg:` ≥1024px). Every page is checked at **375 / 768 /
  1280px** before it's done; per-page layouts are in `docs/PRODUCT.md` → "Responsive design".
  Use `dvh` units and safe-area insets for full-height/sticky layouts, ≥44px touch targets,
  no hover-only actions, 16px (`text-base`) inputs, and never allow horizontal page scroll.
- If a second frontend appears (e.g. Astro site), move tokens + `components/ui` to `packages/ui`.

## Infrastructure (`infra/`)
- One module per concern; `envs/prod` only wires modules together and declares outputs.
- Every resource must be on a free plan explicitly; reject changes that would upgrade a plan.
- Generated secrets (DB URL, Upstash token; post-MVP `random_password` for `BETTER_AUTH_SECRET`) are exposed as
  `sensitive = true` outputs in `envs/prod/outputs.tf`; CI pushes them to the Worker (see
  "Secrets & config"). Output names map 1:1 to env var names (`database_url` → `DATABASE_URL`).
- Run `terraform fmt` and `terraform validate` before finishing any infra change.
- Never run `terraform apply` or `destroy` locally without explicit user approval; show the plan
  first. The normal path is: PR (plan comment) → merge → `deploy.yml` applies.

### Terraform state — HCP Terraform (Free)
- State lives in HCP Terraform (Free tier: up to 500 managed resources, 1 concurrent run).
  `infra/envs/prod` declares `cloud { organization = "<org>" workspaces { name = "samongnoi-prod" } }`.
- The workspace uses **Local execution mode**: Terraform runs in GitHub Actions; HCP only stores,
  versions, encrypts and locks state. Provider credentials therefore live in GitHub secrets, not
  HCP workspace variables.
- Never use a local backend, commit `*.tfstate`, or move state elsewhere without asking.

## CI/CD (`.github/`)

| Workflow     | Trigger                         | What it does                                                                 |
|--------------|---------------------------------|-------------------------------------------------------------------------------|
| `ci.yml`     | PR → `main`                     | Affected packages: lint, typecheck, test, build. If `infra/**` changed: fmt, validate, plan, plan posted as PR comment |
| `deploy.yml` | push to `main` (incl. merges), manual | `infra` (plan + apply) → `app`: build web + api → migrate → one `wrangler deploy` (API + static assets) |
| `drift.yml`  | weekly cron, manual             | `terraform plan -detailed-exitcode`; opens an issue if live resources drifted |

- Change detection uses `dorny/paths-filter`: any `apps/**`, `packages/**`, or lockfile change
  deploys the app (web + api ship together); infra changes also redeploy it (bindings may have
  changed); docs-only changes skip all.
- Shared setup (pnpm + Node from `.nvmrc` + cached install) is the composite action
  `.github/actions/setup` — reuse it instead of repeating steps.
- All Terraform jobs share the `terraform-prod` concurrency group; deploys share `deploy-main`
  with `cancel-in-progress: false` so an apply is never interrupted.
- The PR plan comment is the review gate for infra: merging = approving the apply.
- DB migrations run before the Worker deploy, so they must be backward-compatible
  (expand → deploy → contract in a later PR).
- Every job has `timeout-minutes`; keep it that way (private repos get 2,000 free min/month).
- Pin actions to a major version (`@v4`), and keep job `permissions` minimal.

Required GitHub **secrets**: provider credentials `TF_API_TOKEN`, `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `NEON_API_KEY`, `UPSTASH_EMAIL`, `UPSTASH_API_KEY`; third-party app
secrets (kind 3 below) `GEMINI_API_KEY` (post-MVP auth adds `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`). No GitHub
variables are needed. Values are set by the user with `scripts/setup-github-secrets.sh` (hidden
prompts → `gh secret set`); never ask for secret values in chat — see the `manage-secrets` skill.

## Secrets & config

One source of truth per value, decided by **who creates it**:

| Kind | Examples | Source of truth | Reaches the app via |
|------|----------|-----------------|---------------------|
| 1. Provider credentials | `CLOUDFLARE_API_TOKEN`, `NEON_API_KEY`, `UPSTASH_API_KEY`, `TF_API_TOKEN` | GitHub secrets (CI); local shell / gitignored `.envrc` | Terraform + wrangler only — never the app |
| 2. Generated by Terraform | `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (post-MVP: `BETTER_AUTH_SECRET`) | HCP Terraform state (encrypted), `sensitive` outputs | CI `terraform-outputs` action (masked) → wrangler-action `secrets:` → Worker secrets |
| 3. Third-party, made by hand | email API key, OAuth client secret | GitHub secrets | step `env:` → wrangler-action `secrets:` → Worker secrets |
| 4. Non-secret config | `APP_ENV`, `APP_URL` / public `VITE_*` (e.g. analytics key) | `wrangler.toml` `[vars]` (committed) / build-step env | `c.env.*` / baked into the web build |

```
GitHub secrets ─(kind 1)─► terraform apply ─► Neon / Upstash / random_password
                                  │ HCP state
                                  ▼ terraform output -json (masked)
app job ─► build web + api ─► migrations (DATABASE_URL) ─► wrangler deploy + secret bulk
          ─► one Worker: /api/* → c.env.DATABASE_URL ...   everything else → web/dist assets
```

**To add, remove, rename, or rotate any secret or env var, use the `manage-secrets` skill**
(`.claude/skills/manage-secrets/SKILL.md`) — it lists every file to touch per kind.

Rules:
- Never put secrets in `wrangler.toml`, `VITE_*` vars, logs, or committed files. `VITE_*` and
  `[vars]` are public.
- Adding a new Worker secret = (a) Terraform output **or** GitHub secret, (b) add its name to the
  `secrets:` list in `deploy.yml`, (c) add it to the zod schema in `apps/api/src/env.ts`,
  (d) add a placeholder to `apps/api/.dev.vars.example`.
- `apps/api/src/env.ts` validates `c.env` with zod — a missing secret fails fast with a clear error.
- Mark every secret Terraform variable/output `sensitive = true`; keep HCP team access minimal.
- Rotate a generated secret with `terraform apply -replace=<resource>` (via PR); the next deploy
  pushes the new value automatically.
- Scope tokens minimally (Cloudflare token: Workers Scripts, Queues for this account only).
- Turborepo runs in strict env mode: declare build-time env vars (`VITE_*`) in `turbo.json`
  task `env`, or they won't reach the build.

Local development never needs production secrets:

| Where | File | Committed |
|-------|------|-----------|
| API (`wrangler dev`, :8787) | `apps/api/.dev.vars` → docker compose Postgres/Redis | no — commit `.dev.vars.example` |
| Web (Vite, :5173) | `apps/web/.env.local` (public `VITE_*` only) | no — commit `.env.example` |
| Terraform | `terraform login` (HCP) + provider tokens in `.envrc` (direnv) | no |

Local dev keeps one origin too: Vite's dev server proxies `/api` (including WebSockets,
`ws: true`) to `wrangler dev` on :8787, so the browser only ever talks to `localhost:5173`.

## `apps/api/wrangler.toml`

The Worker's config file, read by `wrangler dev` / `wrangler deploy`: name, entry point, runtime
version, bindings, and non-secret `[vars]`. `wrangler types` generates the `Env` type from it.

```toml
name = "samongnoi"                           # → https://samongnoi.<subdomain>.workers.dev
main = "src/index.ts"
compatibility_date = "2026-10-01"          # bump deliberately, never automatically
compatibility_flags = ["nodejs_compat"]

[observability]
enabled = true

[vars]                                      # non-secret only — this file is committed
APP_ENV = "production"
APP_URL = "https://samongnoi.<subdomain>.workers.dev"   # WS Origin check; post-MVP Better Auth baseURL

[assets]                                    # Workers Static Assets: the SPA
directory = "../web/dist"                   # build apps/web first
not_found_handling = "single-page-application"  # unknown paths → index.html (client routing)
run_worker_first = ["/api/*"]               # only API paths invoke the Worker; assets are free

[ai]
binding = "AI"                              # Workers AI → c.env.AI (no Terraform resource)

[[durable_objects.bindings]]
name = "THREAD_ROOM"                        # c.env.THREAD_ROOM.get(idFromName(threadId))
class_name = "ThreadRoom"                   # exported from src/index.ts

[[migrations]]                              # append a new tag for every DO class change
tag = "v1"
new_sqlite_classes = ["ThreadRoom"]         # Free plan supports SQLite-backed DOs only

[[queues.producers]]
binding = "JOBS_QUEUE"
queue = "samongnoi-jobs"                     # must match the Terraform queue name

[[queues.consumers]]
queue = "samongnoi-jobs"
max_batch_size = 10
max_retries = 3
```

- Secrets never appear here — they're uploaded by CI and appear in `c.env` at runtime.
- After changing bindings or `[vars]`, run `pnpm --filter api wrangler types` and commit the
  regenerated `worker-configuration.d.ts`.
- `apps/web` has no wrangler config — it's just a Vite build whose `dist/` this Worker serves.
- Any new server route must live under `/api/*`, or it will be shadowed by the SPA fallback.

## Conventions
- Never commit secrets; keep `.env.example` / `.dev.vars.example` up to date.
- Validate all external input with zod at the edge of the system (HTTP, queue, env).
- Tests: services are unit-tested with fake `deps` (no DB, no Workers runtime); routes get
  integration tests via `vitest-pool-workers`.
- Naming: files `<feature>.<layer>.ts` (`users.routes.ts`, `users.service.ts`,
  `users.repository.ts`); functions are verbs (`createUser`, `findUserById`).
- Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `infra:`).
- CI must pass lint, typecheck, test, and `terraform validate`.
