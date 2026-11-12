variable "project_id" {
  description = "GCP project to deploy into."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Cloud SQL and Artifact Registry."
  type        = string
  default     = "europe-west1"
}

variable "service_name" {
  description = "Name of the Cloud Run service; also used as a prefix for related resources."
  type        = string
  default     = "price-reconciliation-api"
}

variable "github_repository" {
  description = "owner/repo allowed to deploy through workload identity federation."
  type        = string
  default     = "ondrejivan/price-reconciliation-agent"
}

variable "image" {
  description = "Initial container image. CI deploys replace it, and Terraform ignores later changes."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "reconciler" {
  description = "\"deterministic\" or \"claude\". Use \"claude\" only after adding a version to the anthropic-api-key secret."
  type        = string
  default     = "deterministic"

  validation {
    condition     = contains(["deterministic", "claude"], var.reconciler)
    error_message = "reconciler must be \"deterministic\" or \"claude\"."
  }
}

variable "db_tier" {
  description = "Cloud SQL machine tier. db-f1-micro is the cheapest shared-core tier."
  type        = string
  default     = "db-f1-micro"
}

variable "db_deletion_protection" {
  description = "Protect the Cloud SQL instance from terraform destroy."
  type        = bool
  default     = true
}

variable "public" {
  description = "Allow unauthenticated requests to the Cloud Run service."
  type        = bool
  default     = true
}
