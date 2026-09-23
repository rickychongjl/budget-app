using '../main.bicep'

// Secrets and the email come from the shell that runs the deployment, never from this file:
//   $env:SQL_ADMIN_PASSWORD = '...'; $env:ALERT_EMAIL = '...'   (PowerShell)
// The Entra values are the same as local user-secrets, except the client secret, which is production's own (budget-prod).

param env = 'prod'
param image = 'ghcr.io/rickychongjl/budget-app:latest'
param githubRepo = 'rickychongjl/budget-app'
param alertEmail = readEnvironmentVariable('ALERT_EMAIL')
param budgetAmount = 30
param budgetStartDate = '2026-10-01'

param sqlAdminLogin = 'budgetadmin'
param sqlAdminPassword = readEnvironmentVariable('SQL_ADMIN_PASSWORD')

param entraTenantId = readEnvironmentVariable('ENTRA_TENANT_ID', '')
param entraClientId = readEnvironmentVariable('ENTRA_CLIENT_ID', '')
param entraClientSecret = readEnvironmentVariable('ENTRA_CLIENT_SECRET', '')
param allowedOids = readEnvironmentVariable('AUTH_ALLOWED_OIDS', '')

// Runbook steps 6 to 8 (docs/plans/m9-infra.md) fill these in, in that order.
param customDomain = 'tightarse.app'
param customDomainCertificateId = '/subscriptions/7997d424-7699-4c60-947c-b196908ed469/resourceGroups/bgt-prod-rg/providers/Microsoft.App/managedEnvironments/bgt-prod-env/managedCertificates/mc-bgt-prod-env-tightarse-app-3620'
param restrictIngressToCloudflare = true
