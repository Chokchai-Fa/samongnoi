# Output names map 1:1 to Worker env vars (database_url → DATABASE_URL) via
# .github/actions/terraform-outputs. Keep them in sync with apps/api/src/env.ts and the
# `secrets:` list in .github/workflows/deploy.yml.

output "database_url" {
  value     = module.neon_db.connection_uri
  sensitive = true
}

output "upstash_redis_rest_url" {
  value = module.upstash_redis.rest_url
}

output "upstash_redis_rest_token" {
  value     = module.upstash_redis.rest_token
  sensitive = true
}

output "queue_name" {
  value = module.queue.name
}
