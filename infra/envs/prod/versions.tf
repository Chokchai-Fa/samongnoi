terraform {
  required_version = ">= 1.5.7"

  # State in HCP Terraform (Free), workspace in **Local** execution mode — Terraform runs in
  # GitHub Actions / locally; HCP only stores, locks, and versions state.
  cloud {
    organization = "samongnoi"

    workspaces {
      name = "samongnoi"
    }
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.27"
    }
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.18"
    }
    upstash = {
      source  = "upstash/upstash"
      version = "~> 2.1"
    }
  }
}
