# Neon Postgres project (free plan): one project with its default branch, database, and role.
terraform {
  required_providers {
    neon = { source = "kislerdm/neon" }
  }
}

variable "name" {
  type        = string
  description = "Neon project name."
}

variable "org_id" {
  type        = string
  description = "Neon organization ID that owns the project."
}

variable "region_id" {
  type        = string
  description = "Neon region, e.g. aws-ap-southeast-1."
}

variable "pg_version" {
  type    = number
  default = 17
}

variable "history_retention_seconds" {
  type        = number
  default     = 21600
  description = "Point-in-time restore window. Free plan max is 6 h (21600 s); the provider's own default (24 h) is rejected."
}

variable "database_name" {
  type    = string
  default = "app"
}

variable "role_name" {
  type    = string
  default = "app"
}

resource "neon_project" "this" {
  name       = var.name
  org_id     = var.org_id
  region_id  = var.region_id
  pg_version = var.pg_version

  # Must be set explicitly: the provider defaults to 24 h, above the free plan's 6 h maximum.
  history_retention_seconds = var.history_retention_seconds

  # Free plan: leave compute size and autosuspend (scale to zero) at the plan defaults —
  # values above the free limits make the API reject the project.
  branch {
    name          = "main"
    database_name = var.database_name
    role_name     = var.role_name
  }

  lifecycle {
    prevent_destroy = true # the production database; remove deliberately if ever needed
  }
}

output "connection_uri" {
  description = "Direct connection string (includes credentials)."
  value       = neon_project.this.connection_uri
  sensitive   = true
}

output "project_id" {
  value = neon_project.this.id
}
