output "service_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "image_repository" {
  description = "Push images here, e.g. <image_repository>/api:<tag>."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "cloudsql_connection_name" {
  value = google_sql_database_instance.main.connection_name
}

output "anthropic_api_key_secret" {
  value = google_secret_manager_secret.anthropic_api_key.secret_id
}

# The three values below go into GitHub repository secrets for the deploy workflow.
output "github_secret_GCP_PROJECT_ID" {
  value = var.project_id
}

output "github_secret_GCP_WORKLOAD_IDENTITY_PROVIDER" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "github_secret_GCP_SERVICE_ACCOUNT" {
  value = google_service_account.deployer.email
}
