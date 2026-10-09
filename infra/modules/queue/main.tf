# Cloudflare Queue for background jobs. The Worker's producer/consumer bindings live in
# apps/api/wrangler.toml and must use the same name.
terraform {
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare" }
  }
}

variable "account_id" {
  type = string
}

variable "name" {
  type = string
}

resource "cloudflare_queue" "this" {
  account_id = var.account_id
  queue_name = var.name
}

output "name" {
  value = cloudflare_queue.this.queue_name
}
