# Credentials come only from environment variables (GitHub secrets in CI, .envrc locally):
#   CLOUDFLARE_API_TOKEN, NEON_API_KEY, UPSTASH_EMAIL, UPSTASH_API_KEY
provider "cloudflare" {}

provider "neon" {}

provider "upstash" {}
