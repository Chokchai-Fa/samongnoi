variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID (TF_VAR_cloudflare_account_id; GitHub secret CLOUDFLARE_ACCOUNT_ID)."
}

variable "project_name" {
  type        = string
  description = "Prefix for every resource name."
  default     = "samongnoi"
}

variable "neon_region" {
  type        = string
  description = "Neon region, close to users and to the Upstash region."
}

variable "upstash_region" {
  type        = string
  description = "Upstash primary region (AWS region name)."
}
