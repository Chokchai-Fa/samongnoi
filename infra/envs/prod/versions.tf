terraform {
  required_version = ">= 1.5.7"

  # State in HCP Terraform (Free), workspace in **Local** execution mode — Terraform runs in
  # GitHub Actions / locally; HCP only stores, locks, and versions state.
  cloud {
    organization = "CHANGE-ME" # TODO(phase 0): your HCP Terraform organization (infra/README.md §1.4)

    workspaces {
      name = "samongnoi-prod"
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
