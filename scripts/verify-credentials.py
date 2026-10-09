#!/usr/bin/env python3
"""Check every Phase 0 credential against its provider — without ever printing a secret.

Usage:
  scripts/verify-credentials.py                       # reads ./.secrets.env (gitignored)
  scripts/verify-credentials.py --from-file path.env
  scripts/verify-credentials.py --from-env            # use variables already in the environment

Prints only statuses, permission names, and non-secret identifiers (account/org/workspace names,
existing project names). Exit code 1 if any check fails. Python 3 stdlib only.

Catches the setup mistakes that otherwise surface as confusing Terraform/wrangler errors:
- Cloudflare account ID typo ("Authentication error" / "Invalid account identifier" everywhere)
- Cloudflare token missing Workers Scripts / Queues / Account Settings permissions
- HCP *organization* token (cannot lock or write state) instead of a user/team token
- HCP workspace name or execution mode not matching infra/envs/prod/versions.tf
- Neon / Upstash / Gemini keys that don't authenticate
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSIONS_TF = ROOT / "infra" / "envs" / "prod" / "versions.tf"
TFVARS = ROOT / "infra" / "envs" / "prod" / "terraform.tfvars"

failures = 0


def ok(label: str, detail: str = "") -> None:
    print(f"  ✓ {label}" + (f" — {detail}" if detail else ""))


def fail(label: str, detail: str, hint: str = "") -> None:
    global failures
    failures += 1
    print(f"  ✗ {label} — {detail}")
    if hint:
        print(f"      → {hint}")


def request(url: str, headers: dict[str, str] | None = None) -> tuple[int, object]:
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, json.loads(res.read() or b"null")
    except urllib.error.HTTPError as err:
        try:
            return err.code, json.loads(err.read() or b"null")
        except ValueError:
            return err.code, None
    except (urllib.error.URLError, TimeoutError) as err:
        return 0, {"network_error": str(err)}


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip().removeprefix("export ").strip()] = value.strip().strip('"').strip("'")
    return values


def tf_setting(pattern: str, path: Path) -> str | None:
    if not path.exists():
        return None
    match = re.search(pattern, path.read_text())
    return match.group(1) if match else None


def cf_errors(body: object) -> str:
    if isinstance(body, dict):
        return ", ".join(e.get("message", "?") for e in body.get("errors", [])) or "unknown error"
    return "unexpected response"


def check_cloudflare(env: dict[str, str]) -> None:
    print("Cloudflare")
    token, account = env.get("CLOUDFLARE_API_TOKEN"), env.get("CLOUDFLARE_ACCOUNT_ID")
    if not token or not account:
        fail("credentials", "CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID missing")
        return
    h = {"Authorization": f"Bearer {token}"}
    if len(account) != 32:
        fail("account ID format", f"{len(account)} chars (expected 32)", "copy it again from Workers & Pages → Account details")

    # Account-owned tokens verify under /accounts/{id}; user-owned tokens under /user.
    _, body = request(f"https://api.cloudflare.com/client/v4/accounts/{account}/tokens/verify", h)
    kind = "account-owned"
    if not (isinstance(body, dict) and body.get("success")):
        _, body = request("https://api.cloudflare.com/client/v4/user/tokens/verify", h)
        kind = "user-owned"
    if isinstance(body, dict) and body.get("success") and body["result"].get("status") == "active":
        ok("token active", kind)
    else:
        fail("token", cf_errors(body), "re-copy the token; it's shown only once when created")
        return

    _, body = request("https://api.cloudflare.com/client/v4/accounts?per_page=50", h)
    if isinstance(body, dict) and body.get("success"):
        ids = [a["id"] for a in body["result"]]
        if account in ids:
            ok("account ID matches the token's account")
        elif len(ids) == 1:
            fail(
                "account ID",
                f"token belongs to {ids[0][:6]}…, but CLOUDFLARE_ACCOUNT_ID is {account[:6]}…",
                "fix the typo in CLOUDFLARE_ACCOUNT_ID, then re-run setup-github-secrets.sh",
            )
            return
        else:
            fail("account ID", "not among the token's accounts", "check CLOUDFLARE_ACCOUNT_ID")
            return

    base = f"https://api.cloudflare.com/client/v4/accounts/{account}"
    for label, path, perm in [
        ("Workers Scripts", "/workers/scripts", "Account → Workers Scripts: Edit"),
        ("Queues", "/queues", "Account → Queues: Edit"),
        ("Account Settings", "", "Account → Account Settings: Read"),
    ]:
        _, body = request(base + path, h)
        if isinstance(body, dict) and body.get("success"):
            ok(f"permission: {label}")
        else:
            fail(f"permission: {label}", cf_errors(body), f"edit the token and add {perm}")

    _, body = request(base + "/workers/subdomain", h)
    if isinstance(body, dict) and body.get("success") and body["result"].get("subdomain"):
        subdomain = body["result"]["subdomain"]
        ok("workers.dev subdomain", subdomain)
        app_url = tf_setting(r'APP_URL\s*=\s*"([^"]+)"', ROOT / "apps" / "api" / "wrangler.toml")
        if app_url and f".{subdomain}.workers.dev" not in app_url:
            fail("APP_URL", f"{app_url} doesn't use subdomain '{subdomain}'", "update APP_URL in apps/api/wrangler.toml")
    else:
        fail("workers.dev subdomain", "not set", "Workers & Pages → set your workers.dev subdomain once")


def check_hcp(env: dict[str, str]) -> None:
    print("HCP Terraform")
    token = env.get("TF_API_TOKEN")
    if not token:
        fail("credentials", "TF_API_TOKEN missing")
        return
    h = {"Authorization": f"Bearer {token}", "Content-Type": "application/vnd.api+json"}
    api = "https://app.terraform.io/api/v2"

    status, body = request(f"{api}/account/details", h)
    username = body.get("data", {}).get("attributes", {}).get("username", "") if isinstance(body, dict) else ""
    if status == 401:
        fail("token", "rejected (401)", "create a new token: avatar → Account settings → Tokens")
        return
    if username.startswith("api-org-"):
        fail(
            "token type",
            "organization token — it cannot lock or write state, so plan/apply fail",
            "create a USER token (avatar → Account settings → Tokens) or an owners TEAM token",
        )
    elif username:
        ok("token type", f"user token ({username})")
    else:
        ok("token type", "team token")

    org = tf_setting(r'organization\s*=\s*"([^"]+)"', VERSIONS_TF)
    workspace = tf_setting(r'workspaces\s*\{[^}]*name\s*=\s*"([^"]+)"', VERSIONS_TF)
    if not org or org == "CHANGE-ME":
        fail("organization", f"versions.tf has {org!r}", "set cloud.organization in infra/envs/prod/versions.tf")
        return
    status, body = request(f"{api}/organizations/{org}/workspaces/{workspace}", h)
    data = body.get("data") if isinstance(body, dict) else None
    if not data:
        _, orgs = request(f"{api}/organizations", h)
        names = [o["id"] for o in orgs.get("data", [])] if isinstance(orgs, dict) else []
        fail(
            "workspace",
            f"{org}/{workspace} not found ({status}); token sees organizations {names}",
            "create the workspace (CLI-driven) or fix the names in versions.tf",
        )
        return
    attrs = data["attributes"]
    ok("workspace", f"{org}/{workspace}")
    if attrs.get("execution-mode") == "local":
        ok("execution mode", "local")
    else:
        fail("execution mode", attrs.get("execution-mode", "?"), "workspace → Settings → General → Execution Mode: Local")
    perms = attrs.get("permissions", {})
    if perms.get("can-lock") and perms.get("can-create-state-versions"):
        ok("state permissions", "can lock + write state")
    else:
        fail("state permissions", "token can't lock/write state", "use a user token or an owners team token")


def check_neon(env: dict[str, str]) -> None:
    print("Neon")
    key = env.get("NEON_API_KEY")
    if not key:
        fail("credentials", "NEON_API_KEY missing")
        return
    h = {"Authorization": f"Bearer {key}", "Accept": "application/json"}
    status, body = request("https://console.neon.tech/api/v2/projects?limit=20", h)
    if isinstance(body, dict) and "projects" in body:
        names = [p["name"] for p in body["projects"]]
        ok("API key", f"existing projects: {names or 'none'}")
        project = tf_setting(r'project_name"[^}]*default\s*=\s*"([^"]+)"', TFVARS.parent / "variables.tf")
        extra = [n for n in names if n != project]
        if extra:
            print(f"      note: {extra} aren't managed by Terraform — delete the sign-up project to save quota")
    else:
        fail("API key", f"rejected ({status})", "Neon console → Organization settings → API keys")
        return
    _, orgs = request("https://console.neon.tech/api/v2/users/me/organizations", h)
    org_ids = [o.get("id") for o in orgs.get("organizations", [])] if isinstance(orgs, dict) else []
    configured = tf_setting(r'neon_org_id\s*=\s*"([^"]+)"', TFVARS)
    if configured and configured in org_ids:
        ok("neon_org_id", configured)
    elif org_ids:
        fail("neon_org_id", f"terraform.tfvars has {configured!r}; your orgs: {org_ids}", "set neon_org_id in terraform.tfvars")


def check_upstash(env: dict[str, str]) -> None:
    print("Upstash")
    email, key = env.get("UPSTASH_EMAIL"), env.get("UPSTASH_API_KEY")
    if not email or not key:
        fail("credentials", "UPSTASH_EMAIL / UPSTASH_API_KEY missing")
        return
    auth = base64.b64encode(f"{email}:{key}".encode()).decode()
    status, body = request("https://api.upstash.com/v2/redis/databases", {"Authorization": f"Basic {auth}"})
    if isinstance(body, list):
        ok("API key", f"existing databases: {[d.get('database_name') for d in body] or 'none'}")
    else:
        fail("API key", f"rejected ({status})", "Upstash console → Account → Management API; email = login email")


def check_gemini(env: dict[str, str]) -> None:
    print("Gemini (AI Studio)")
    key = env.get("GEMINI_API_KEY")
    if not key:
        print("  - skipped (GEMINI_API_KEY not set — only needed with the AI add-on)")
        return
    status, body = request(f"https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key={key}")
    if isinstance(body, dict) and "models" in body:
        flash = [m["name"].removeprefix("models/") for m in body["models"] if "flash" in m["name"]]
        ok("API key", f"{len(body['models'])} models available, e.g. {flash[:2]}")
    else:
        fail("API key", f"rejected ({status})", "aistudio.google.com → Get API key")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--from-file", default=str(ROOT / ".secrets.env"))
    source.add_argument("--from-env", action="store_true")
    args = parser.parse_args()

    if args.from_env:
        env = dict(os.environ)
    else:
        path = Path(args.from_file)
        if not path.exists():
            print(f"{path} not found (use --from-env to read the environment)", file=sys.stderr)
            return 2
        env = load_env_file(path)

    for check in (check_cloudflare, check_hcp, check_neon, check_upstash, check_gemini):
        check(env)
    print()
    print("All credentials OK." if failures == 0 else f"{failures} problem(s) found.")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
