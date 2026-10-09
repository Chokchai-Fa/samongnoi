# Upstash Redis database (free plan) used as a cache / rate-limit store via the REST API.
terraform {
  required_providers {
    upstash = { source = "upstash/upstash" }
  }
}

variable "name" {
  type        = string
  description = "Upstash database name."
}

variable "primary_region" {
  type        = string
  description = "AWS region for the database, e.g. ap-southeast-1."
}

resource "upstash_redis_database" "this" {
  database_name = var.name
  # Provider 2.1.x: new databases are "global" with a primary region. (Unreleased provider
  # versions replace `region` with `platform`; switch when upgrading.)
  region         = "global"
  primary_region = var.primary_region
  tls            = true
  eviction       = true  # it's a cache: evict instead of failing writes at the size limit
  auto_scale     = false # never upgrade to a paid plan automatically
}

output "rest_url" {
  value = "https://${upstash_redis_database.this.endpoint}"
}

output "rest_token" {
  value     = upstash_redis_database.this.rest_token
  sensitive = true
}
