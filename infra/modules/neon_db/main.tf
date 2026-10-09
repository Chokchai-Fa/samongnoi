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

variable "region_id" {
  type        = string
  description = "Neon region, e.g. aws-ap-southeast-1."
}

variable "pg_version" {
  type    = number
  default = 17
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
  region_id  = var.region_id
  pg_version = var.pg_version

  # Free plan: leave compute size, autosuspend (scale to zero), and history retention at the
  # plan defaults — setting values above the free limits makes the API reject the project.
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
