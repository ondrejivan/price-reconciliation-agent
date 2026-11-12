terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.11"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }

  # State is local by default. For shared use, create a bucket and switch to:
  # backend "gcs" { bucket = "<project>-tfstate", prefix = "price-reconciliation-agent" }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
