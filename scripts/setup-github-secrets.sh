#!/usr/bin/env bash
# Set the GitHub Actions secrets this repo needs (see infra/README.md §1.8).
#
# Values are read with hidden input (or from a gitignored dotenv file) and piped straight to
# `gh secret set` via stdin — they are never echoed, written to disk, or put in argv/history.
#
# Usage:
#   scripts/setup-github-secrets.sh [--repo owner/name]              # interactive prompts
#   scripts/setup-github-secrets.sh [--repo owner/name] --from-file .secrets.env
#   scripts/setup-github-secrets.sh [--repo owner/name] --check      # list which are set
#
# Interactive mode: press Enter on an empty prompt to skip (keeps the existing value).
set -euo pipefail

# name|where to get it (infra/README.md section)
SECRETS=(
  "TF_API_TOKEN|HCP Terraform team/user API token (§1.4)"
  "CLOUDFLARE_API_TOKEN|Cloudflare custom API token (§1.3)"
  "CLOUDFLARE_ACCOUNT_ID|Cloudflare account ID (§1.3)"
  "NEON_API_KEY|Neon account API key (§1.5)"
  "UPSTASH_EMAIL|Upstash login email (§1.5)"
  "UPSTASH_API_KEY|Upstash Management API key (§1.5)"
  "GEMINI_API_KEY|Google AI Studio API key (§1.7)"
)

repo=""
mode="interactive"
file=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --from-file) mode="file"; file="$2"; shift 2 ;;
    --check) mode="check"; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

command -v gh >/dev/null || { echo "gh CLI not found" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first" >&2; exit 1; }

if [[ -z "$repo" ]]; then
  repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null) || {
    echo "Can't detect the repo — pass --repo owner/name" >&2; exit 1; }
fi
echo "Repository: $repo"

existing=$(gh secret list --repo "$repo" --json name --jq '.[].name')
is_set() { grep -qx "$1" <<<"$existing"; }

case "$mode" in
  check)
    missing=0
    for entry in "${SECRETS[@]}"; do
      name=${entry%%|*}
      if is_set "$name"; then echo "  ✓ $name"; else echo "  ✗ $name  — ${entry#*|}"; missing=1; fi
    done
    exit "$missing"
    ;;

  file)
    [[ -f "$file" ]] || { echo "File not found: $file" >&2; exit 1; }
    if git check-ignore -q "$file" 2>/dev/null; then :; else
      echo "Refusing: $file is not gitignored (add it to .gitignore first)" >&2; exit 1
    fi
    # Only push known names, so a stray line in the file can't create surprise secrets.
    for entry in "${SECRETS[@]}"; do
      name=${entry%%|*}
      value=$(grep -E "^${name}=" "$file" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true)
      if [[ -z "$value" ]]; then echo "  - $name: not in file, skipped"; continue; fi
      printf '%s' "$value" | gh secret set "$name" --repo "$repo"
      echo "  ✓ $name set"
    done
    unset value
    echo "Done. Consider deleting $file now: rm $file"
    ;;

  interactive)
    for entry in "${SECRETS[@]}"; do
      name=${entry%%|*}
      hint=${entry#*|}
      status=$(is_set "$name" && echo "already set" || echo "NOT set")
      echo
      echo "$name  [$status]"
      echo "  $hint"
      read -r -s -p "  value (hidden, Enter to skip): " value
      echo
      if [[ -z "$value" ]]; then echo "  skipped"; continue; fi
      printf '%s' "$value" | gh secret set "$name" --repo "$repo"
      echo "  ✓ set"
    done
    unset value
    ;;
esac

echo
echo "Secrets now on $repo (names only):"
gh secret list --repo "$repo"
