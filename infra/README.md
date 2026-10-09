# Infrastructure setup & plan

Everything needed to stand up the app's infrastructure from zero: the **manual one-time steps**
(accounts, tokens, settings that no Terraform provider can do), what **Terraform** creates, what
**wrangler** deploys, and the **first-deploy order**. All services are free tier with **no
credit card**.

> Never paste tokens or secrets into chat, issues, commits, or this file. They go only into
> GitHub secrets, your local `.envrc` (gitignored), or a password manager.

---

## 0. Overview — who creates what

| Thing | Created by | Why not Terraform |
|-------|-----------|-------------------|
| GitHub repo + Actions secrets | **Manual** (once) | Possible via the `github` provider, but it'd need a GitHub token to bootstrap — not worth it |
| Cloudflare account, `workers.dev` subdomain, API token | **Manual** (once) | Account-level bootstrap |
| HCP Terraform org + workspace | **Manual** (once) | It stores Terraform's own state — chicken-and-egg |
| Neon account + API key | **Manual** (once) | Bootstrap credential |
| Upstash account + API key | **Manual** (once) | Bootstrap credential |
| Google OAuth client (Sign in with Google) — **post-MVP** | **Manual** (once) | No Terraform support for standard OAuth web clients |
| Gemini API key | **Manual** (once) | Created in Google AI Studio only |
| Neon project / database / role | **Terraform** | |
| Upstash Redis database | **Terraform** | |
| Cloudflare Queue `samongnoi-jobs` | **Terraform** | |
| `BETTER_AUTH_SECRET` (`random_password`) — **post-MVP** | **Terraform** | |
| Worker `app` (API + static assets + Durable Object + queue consumer + AI binding) | **wrangler** in CI | Code deploys; Terraform would fight wrangler over the script |
| Worker secrets | **wrangler** in CI (`secrets:` from Terraform outputs + GitHub secrets) | |
| DB schema | **drizzle-kit** migrations in CI | |

```
Manual (once) ──► GitHub secrets ──► CI: terraform apply ──► Neon, Upstash, Queue, random_password
                                          │ outputs (HCP state)
                                          ▼
                                     CI: build web + api → migrate → wrangler deploy (+ secrets)
                                          ▼
                         https://app.samongnoi.workers.dev  (SPA + /api)
```

---

## 1. Manual one-time setup

Do these in order — later steps need values from earlier ones. Tick them off as you go.
Record non-secret values (account IDs, subdomain, org name) in the table in §1.9.

### 1.1 Local tools
- [ ] Node.js **22** (pinned in `.nvmrc`; wrangler 4 requires ≥ 22) — e.g. `nvm install 22`
- [ ] pnpm: `corepack enable` (version pinned in root `package.json` `packageManager`)
- [ ] Terraform **1.16.x** (same as CI — e.g. `brew install hashicorp/tap/terraform` or tfenv)
- [ ] Docker (for the local database/cache in §5)
- [ ] Optional: `direnv` (loads `.envrc` automatically), GitHub CLI `gh`
- wrangler is a dev dependency of `apps/api` — run it via `pnpm --filter api exec wrangler …`

### 1.2 GitHub repository
- [ ] Create the repo (private or public) and push this code to `main`.
- [ ] Settings → Branches → protect `main`: require PRs and the `CI` checks to pass.
- [ ] Note: **public** repos get unlimited Actions minutes and can use Environments with
      required reviewers; **private** repos get 2,000 min/month and no reviewer gates on Free.

### 1.3 Cloudflare (Workers, Static Assets, Durable Objects, Queues, Workers AI)
- [ ] Sign up at dash.cloudflare.com (free plan, no card).
- [ ] **Account ID** (32 hex chars): Workers & Pages → Overview → right sidebar → **copy
      button**, don't retype it. → GitHub secret `CLOUDFLARE_ACCOUNT_ID`. A one-character typo
      makes every call fail with "Authentication error" / "Invalid account identifier", which
      looks like a token problem — `scripts/verify-credentials.py` detects it.
- [ ] **workers.dev subdomain**: Workers & Pages → Overview → set your subdomain once. The app
      will live at `https://app.samongnoi.workers.dev` — you need this URL for Google
      OAuth (§1.6) before the first deploy.
- [ ] **API token** — either kind works: *Manage Account → Account API Tokens* (account-owned,
      recommended) or *My Profile → API Tokens* (user-owned). Create Token → *Custom token*:
      - Account → **Workers Scripts: Edit** (Worker, assets, Durable Objects, secrets)
      - Account → **Queues: Edit**
      - Account → **Account Settings: Read** (wrangler needs it to resolve the account)
      - Account Resources: *Include → your account only*
      - TTL: optional; set a reminder to rotate.
      → GitHub secret `CLOUDFLARE_API_TOKEN`. Grant only these three — not "all permissions".
      Editing a token's permissions later keeps its value; rolling it creates a new value.

### 1.4 HCP Terraform (remote state)
- [ ] Sign up at app.terraform.io (Free tier).
- [ ] Create an **organization** (e.g. `your-name-projects`). Put the name in
      `infra/envs/prod/versions.tf` → `cloud { organization = "…" }`.
- [ ] Create a **workspace** → *CLI-driven workflow*. Its name must equal `workspaces.name` in
      `versions.tf` (here: `samongnoi`).
- [ ] Workspace → Settings → General → **Execution mode: Local**. (Terraform runs in GitHub
      Actions / your machine; HCP only stores, locks, and versions state.)
- [ ] Create a **user** token: avatar → Account settings → Tokens → Create an API token (or an
      *owners* **team** token). → GitHub secret `TF_API_TOKEN`.
      ⚠️ **Not an organization token** (Organization settings → API tokens): it shows up as user
      `api-org-…` and HCP won't let it lock or write state, so `plan` fails with
      "Error acquiring the state lock: resource not found".
- [ ] Locally: `terraform login` (stores a token in `~/.terraform.d/credentials.tfrc.json`).

### 1.5 Neon (Postgres) and Upstash (Redis)
- [ ] **Neon**: sign up at neon.tech (free, no card). Sign-up forces you to create a first
      project — accept any name, then **delete it** (project → Settings → Delete) once you have
      the key; Terraform creates the real one. API key: Organization settings → API keys →
      create → GitHub secret `NEON_API_KEY`.
- [ ] Copy your **Neon organization ID** (`org-…`, Organization settings; not secret) into
      `neon_org_id` in `infra/envs/prod/terraform.tfvars` — API-created projects need it.
- [ ] **Upstash**: sign up at upstash.com (free, no card). Account → Management API → create
      API key. → GitHub secrets `UPSTASH_EMAIL` (your login email) and `UPSTASH_API_KEY`.
      **Don't create a database by hand** — Terraform does.
- [ ] Choose **one region close to your users** for both (e.g. Neon `aws-ap-southeast-1` +
      Upstash `ap-southeast-1` for Southeast Asia). Set it in `infra/envs/prod/terraform.tfvars`
      (non-secret, committed). The Worker runs everywhere, so DB/Redis region drives latency.

### 1.6 Google — Sign in with Google (OAuth client) — ⏸ post-MVP, skip for now

The MVP has no authentication (see `docs/PRODUCT.md`). Do this section when starting
`PLAN.md` → "Post-MVP phase A", and add the two secrets back to the script and §1.8 table with
the `manage-secrets` skill.

- [ ] console.cloud.google.com → create a project `samongnoi` (**no billing account needed**).
- [ ] Google Auth Platform (formerly "OAuth consent screen"):
      - **Branding**: app name, support email, developer contact email.
      - **Audience**: *External*; while in **Testing**, add yourself and friends as **test
        users** (max 100). Publishing later needs no review for these basic scopes.
      - **Data access**: scopes `openid`, `email`, `profile` only.
- [ ] **Clients** → Create client → *Web application*:
      - Authorized JavaScript origins:
        `https://app.samongnoi.workers.dev`, `http://localhost:5173`
      - Authorized redirect URIs:
        `https://app.samongnoi.workers.dev/api/auth/callback/google`,
        `http://localhost:5173/api/auth/callback/google`
- [ ] → GitHub secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
      (GitHub forbids secret names starting with `GITHUB_` — another reason this is Google.)

### 1.7 Google AI Studio — Gemini API key
- [ ] aistudio.google.com → **Get API key** → create (pick the same Google Cloud project).
      Stay on the **free tier** — do not enable billing on the project.
- [ ] → GitHub secret `GEMINI_API_KEY`.
- [ ] Remember: free-tier prompts may be used by Google to improve its products. The app shows
      a "don't save private content" notice.

### 1.8 GitHub Actions secrets — final checklist

**Verify first** — before setting secrets, run the read-only checker against your values. It
prints only statuses and non-secret names (never values) and explains each failure:

```bash
scripts/verify-credentials.py                 # reads .secrets.env (gitignored)
```

Set them with the script (hidden prompts → `gh secret set` via stdin; nothing is written to
disk or shell history):

```bash
scripts/setup-github-secrets.sh --repo <owner>/<repo>          # prompts for each value
scripts/setup-github-secrets.sh --repo <owner>/<repo> --check  # ✓/✗ per secret
```
Or fill a gitignored `.secrets.env` (`NAME=value` lines; `chmod 600`) and run with
`--from-file .secrets.env` — verify it with `scripts/verify-credentials.py` first. Delete the
file afterwards, or keep it for local Terraform runs. Manual alternative: Settings → Secrets and variables → Actions →
*Repository secrets*:

| Secret | From | Used by |
|--------|------|---------|
| `TF_API_TOKEN` | §1.4 | all Terraform jobs + `terraform-outputs` action |
| `CLOUDFLARE_API_TOKEN` | §1.3 | Terraform (queue) + wrangler deploy |
| `CLOUDFLARE_ACCOUNT_ID` | §1.3 | Terraform + wrangler deploy |
| `NEON_API_KEY` | §1.5 | Terraform |
| `UPSTASH_EMAIL` | §1.5 | Terraform |
| `UPSTASH_API_KEY` | §1.5 | Terraform |
| `GEMINI_API_KEY` | §1.7 | Worker secret |

Generated secrets (`DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) are
**not** GitHub secrets — they come from Terraform outputs. Post-MVP auth adds
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` here and the generated `BETTER_AUTH_SECRET`.

### 1.9 Non-secret values to record (commit these where noted)

| Value | Example | Goes into |
|-------|---------|-----------|
| Cloudflare workers.dev subdomain | `alice` | `apps/api/wrangler.toml` `APP_URL` |
| App URL | `https://app.samongnoi.workers.dev` (Worker `app` on subdomain `samongnoi`) | `wrangler.toml` `APP_URL`, Google OAuth client |
| HCP organization | `alice-projects` | `infra/envs/prod/versions.tf` |
| HCP workspace | `samongnoi` | `infra/envs/prod/versions.tf` |
| Region (Neon / Upstash) | `aws-ap-southeast-1` / `ap-southeast-1` | `infra/envs/prod/terraform.tfvars` |

---

## 2. Terraform layout (what we'll write)

```
infra/
├── README.md                    # this file
├── modules/
│   ├── neon_db/                 # neon_project (+ default branch/db/role) → connection string
│   ├── upstash_redis/           # upstash_redis_database → REST URL + token
│   ├── queue/                   # cloudflare_queue "samongnoi-jobs"
│   └── app_secrets/             # random_password for BETTER_AUTH_SECRET (post-MVP auth)
└── envs/
    └── prod/
        ├── versions.tf          # terraform ~> 1.16.0, cloud {} block, pinned required_providers
        ├── providers.tf         # cloudflare, neon (kislerdm/neon), upstash, random
        ├── variables.tf         # cloudflare_account_id, regions, names
        ├── terraform.tfvars     # non-secret values only (committed)
        ├── main.tf              # wires the four modules
        ├── outputs.tf           # names map 1:1 to Worker env vars (see below)
        └── .terraform.lock.hcl  # committed — pins provider checksums
```

Providers (versions pinned in `versions.tf`):
`cloudflare/cloudflare`, `kislerdm/neon` (community), `upstash/upstash`, `hashicorp/random`.
Credentials come only from environment variables (`CLOUDFLARE_API_TOKEN`, `NEON_API_KEY`,
`UPSTASH_EMAIL`, `UPSTASH_API_KEY`) — never from `.tf` files or `.tfvars`.

### Resources

| Module | Resource | Key settings (free tier) |
|--------|----------|--------------------------|
| `neon_db` | Neon project | region from tfvars, Postgres 17, default branch `main`, DB `app`, role `app`; history retention at the free minimum; autosuspend default (scale to zero) |
| `upstash_redis` | Redis database | name `samongnoi-cache`, region from tfvars, free plan, TLS on, eviction on (cache) |
| `queue` | Cloudflare Queue | name `samongnoi-jobs` (must equal `wrangler.toml` producer/consumer `queue`) |
| `app_secrets` (post-MVP) | `random_password` | length 48, no special chars; change a `keepers` value to rotate |

### Outputs → Worker env vars

The `terraform-outputs` CI action exports each output as `UPPER_CASE` (`database_url` →
`DATABASE_URL`) and masks sensitive ones. **Keep these names exactly**:

| Output | Sensitive | Becomes |
|--------|:---------:|---------|
| `database_url` | ✅ | `DATABASE_URL` (Neon connection string, `sslmode=require`) |
| `upstash_redis_rest_url` | ❌ | `UPSTASH_REDIS_REST_URL` |
| `upstash_redis_rest_token` | ✅ | `UPSTASH_REDIS_REST_TOKEN` |
| `better_auth_secret` (post-MVP) | ✅ | `BETTER_AUTH_SECRET` |
| `queue_name` | ❌ | `QUEUE_NAME` (informational) |

Adding/removing one later → follow the `manage-secrets` skill.

### Not in Terraform (by design)
- The Worker, its static assets, Durable Object class + migrations, queue **consumer**, AI
  binding → `apps/api/wrangler.toml` + `wrangler deploy`.
- Workers AI → just the `[ai]` binding; nothing to provision.
- Google OAuth client, Gemini key, HCP workspace, GitHub secrets → manual (§1).

---

## 3. First deploy (bootstrap order)

1. Finish **all of §1**.
2. Scaffold code (phase 1): `infra/envs/prod/*`, `apps/api` with `/api/health`, `apps/web`.
3. Locally, check Terraform before anything is created:
   ```bash
   cd infra/envs/prod
   export CLOUDFLARE_API_TOKEN=… NEON_API_KEY=… UPSTASH_EMAIL=… UPSTASH_API_KEY=…   # or direnv
   export TF_VAR_cloudflare_account_id=…
   terraform init && terraform validate && terraform plan
   ```
4. Open a PR → `ci.yml` posts the plan → review → **merge**.
5. `deploy.yml` runs: `infra` applies (creates Neon, Upstash, Queue, secret) → `app` builds
   web + api, runs migrations, uploads Worker secrets, deploys the Worker.
   - The **first** `wrangler deploy` also creates the Durable Object class (`migrations` tag
     `v1`) and attaches the queue consumer.
6. Verify:
   - [ ] `https://app.samongnoi.workers.dev/api/health` → `200`
   - [ ] the SPA loads at `/`, and a deep link like `/threads/x` loads the SPA (not a 404)
   - [ ] Cloudflare dashboard → Worker → Settings → Variables shows the secrets (values hidden)
   - [ ] Neon console shows the project and the migrated tables
7. Done — from now on every change goes PR → merge → automatic deploy.

---

## Troubleshooting (seen in practice)

| Symptom | Cause | Fix |
|---------|-------|-----|
| Every Cloudflare call: "Authentication error"; account endpoint: "Invalid account identifier" | Typo in `CLOUDFLARE_ACCOUNT_ID` | Copy it with the copy button; `verify-credentials.py` names the right one |
| `/user/tokens/verify` says "Invalid API Token" but the token is new | Account-owned token — verify via `/accounts/{id}/tokens/verify` instead | Nothing; the token is fine (the verifier handles both kinds) |
| `terraform plan`: "Error acquiring the state lock: resource not found" | `TF_API_TOKEN` is an HCP **organization** token | Use a user or owners-team token (§1.4) |
| `terraform init`: workspace not found | `workspaces.name` in `versions.tf` ≠ the workspace you created | Make them match |
| Neon apply: "requested history retention seconds exceeds allowed maximum" | Provider defaults to 24 h; free plan max is 6 h | `history_retention_seconds = 21600` (set in the `neon_db` module) |
| Upstash: `platform` "not expected" / `region` required | GitHub docs describe an unreleased provider version | Provider 2.1.x: `region = "global"` + `primary_region` |
| Local `plan` shows in-place updates with no attribute changes, CI says "No changes" | Local Terraform older than CI's | Use the pinned version (1.16.x) everywhere |
| CI `actions/checkout`: "Repository not found" (private repo) | Job-level `permissions:` replaced the workflow's `contents: read` | Add `contents: read` to that job's permissions |
| Deploy fails after a merge that only changed `infra/README.md` | `infra/**` path filter matched docs | Filters are `infra/envs/**` + `infra/modules/**` |

## 4. Day-2 operations

| Task | How |
|------|-----|
| Change infra | Edit `infra/**` → PR (plan comment) → merge (apply) |
| Add/remove/rotate a secret or env var | `manage-secrets` skill |
| See drift | `drift.yml` runs weekly and opens an issue |
| Logs | Cloudflare dashboard → Worker → Logs (observability enabled), or `pnpm --filter api exec wrangler tail` |
| Watch free-tier usage | Cloudflare (Workers, DO, Queues, AI Neurons), Neon (CU-hours, storage), Upstash (commands), AI Studio (Gemini quota) dashboards |
| Rotate a provider token | Create new → update GitHub secret → re-run `deploy.yml` → revoke old |
| Tear down (destructive — ask first) | `terraform destroy` in `infra/envs/prod`, then `wrangler delete` for the Worker |

**What happens at a free limit** (no card on file means no surprise bills):
Workers/DO/Queues → requests start failing until the daily reset (00:00 UTC);
Neon → compute suspends until next month; Upstash → requests rejected; Gemini → `429`
(the app falls back to Workers AI). The app should show friendly errors, never crash.

---

## 5. Local development infrastructure (no cloud quota used)

The app talks to Neon over **HTTP** and to Upstash over **REST**, which plain Postgres and
Redis don't speak. `docker-compose.yml` therefore runs small compatibility proxies:

| Service | Image (pin versions) | Port | Purpose |
|---------|---------------------|------|---------|
| `postgres` | `postgres:17` | 5432 | the database (drizzle-kit migrates it directly) |
| `neon-proxy` | a local Neon HTTP proxy (e.g. `local-neon-http-proxy`) | 4444 | lets `@neondatabase/serverless` talk to local Postgres |
| `redis` | `redis:7` | 6379 | the cache |
| `redis-http` | `serverless-redis-http` (SRH) | 8079 | Upstash-compatible REST API in front of local Redis |

`apps/api/.dev.vars` (gitignored; template in `.dev.vars.example`) points at these:
`DATABASE_URL`, `UPSTASH_REDIS_REST_URL=http://localhost:8079`, a dummy
`UPSTASH_REDIS_REST_TOKEN`, and `GEMINI_API_KEY`. (Post-MVP auth adds a local
`BETTER_AUTH_SECRET` and the `GOOGLE_CLIENT_*` values — localhost URIs are registered in §1.6.)
`wrangler dev` simulates Queues and Durable Objects locally; Workers AI calls go to Cloudflare
(they use your real daily quota — keep local AI testing light).

```bash
docker compose up -d
pnpm --filter api db:migrate
pnpm dev            # Vite :5173 (proxies /api + WebSockets) + wrangler dev :8787
```
