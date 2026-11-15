using '../main.bicep'

// Secrets and the email come from the shell that runs the deployment, never from this file:
//   $env:SQL_ADMIN_PASSWORD = '...'; $env:ALERT_EMAIL = '...'   (PowerShell)
// Google: production's own OAuth client (docs/google_sign_in_setup.md), not the local one. The adopt email is the owner's
// Google address; it is personal, so it comes from the shell too, and once the owner has signed in once it can be left empty.

param env = 'prod'
param image = 'ghcr.io/rickychongjl/budget-app:latest'
param githubRepo = 'rickychongjl/budget-app'
param alertEmail = readEnvironmentVariable('ALERT_EMAIL')
param budgetAmount = 30
param budgetStartDate = '2026-10-01'

param sqlAdminLogin = 'budgetadmin'
param sqlAdminPassword = readEnvironmentVariable('SQL_ADMIN_PASSWORD')

param googleClientId = readEnvironmentVariable('GOOGLE_CLIENT_ID', '')
param googleClientSecret = readEnvironmentVariable('GOOGLE_CLIENT_SECRET', '')
param adoptLegacyUserEmail = readEnvironmentVariable('AUTH_ADOPT_LEGACY_USER_EMAIL', '')
param complimentaryPremiumEmails = readEnvironmentVariable('PLANS_COMPLIMENTARY_PREMIUM_EMAILS', '')

// Runbook steps 6 to 8 (docs/plans/m9-infra.md) fill these in, in that order.
param customDomain = 'tightarse.app'
param customDomainCertificateId = '/subscriptions/7997d424-7699-4c60-947c-b196908ed469/resourceGroups/bgt-prod-rg/providers/Microsoft.App/managedEnvironments/bgt-prod-env/managedCertificates/mc-bgt-prod-env-tightarse-app-3620'
param restrictIngressToCloudflare = true
