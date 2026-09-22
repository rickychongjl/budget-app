// The whole environment, design section 11. Deployed into one resource group:
//   az deployment group create -g bgt-prod-rg -f infra/main.bicep -p infra/parameters/prod.bicepparam
// Review with what-if first (the same command with `what-if` in place of `create`). Runbook: docs/plans/m9-infra.md.
targetScope = 'resourceGroup'

@description('Environment name, the middle of every resource name: bgt-<env>-<resource>.')
param env string = 'prod'
param location string = resourceGroup().location

@description('Image the app and every job run. The deploy workflow moves it to the commit tag; this is the first deploy.')
param image string

@description('GitHub repository (owner/name) whose main branch may deploy, through the federated credential.')
param githubRepo string

@description('Where alerts and the cost budget notify.')
param alertEmail string

@description('Monthly cost budget, in the billing currency. Alerts at 80% forecast and 100% actual.')
param budgetAmount int = 30

@description('First of a month. Fixed at creation, so keep it once set.')
param budgetStartDate string

param sqlAdminLogin string
@secure()
param sqlAdminPassword string

@description('Entra sign-in. Leave empty for demo-only.')
param entraTenantId string = ''
param entraClientId string = ''
@secure()
param entraClientSecret string = ''
@description('Comma-separated Entra object ids allowed to sign in.')
param allowedOids string = ''

@description('Custom domain, once its DNS points here (runbook step 6). Empty until then.')
param customDomain string = ''
@description('Resource id of the managed certificate, once `az containerapp hostname bind` has issued it (runbook step 7).')
param customDomainCertificateId string = ''

@description('Once the domain is proxied (runbook step 8): only Cloudflare may reach the ingress, so the origin cannot be hit directly.')
param restrictIngressToCloudflare bool = false

// Cloudflare's published ranges (https://www.cloudflare.com/ips/). They change rarely; check the page when they do.
var cloudflareRanges = [
  '173.245.48.0/20'
  '103.21.244.0/22'
  '103.22.200.0/22'
  '103.31.4.0/22'
  '141.101.64.0/18'
  '108.162.192.0/18'
  '190.93.240.0/20'
  '188.114.96.0/20'
  '197.234.240.0/22'
  '198.41.128.0/17'
  '162.158.0.0/15'
  '104.16.0.0/13'
  '104.24.0.0/14'
  '172.64.0.0/13'
  '131.0.72.0/22'
  '2400:cb00::/32'
  '2606:4700::/32'
  '2803:f800::/32'
  '2405:b500::/32'
  '2405:8100::/32'
  '2a06:98c0::/29'
  '2c0f:f248::/32'
]

var tags = { project: 'budget', env: env, owner: 'ricky' }
var prefix = 'bgt-${env}'
// Storage accounts and SQL servers are named globally, so those two carry a suffix derived from the resource group.
var suffix = take(uniqueString(resourceGroup().id), 6)

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    prefix: prefix
    location: location
    tags: tags
    alertEmail: alertEmail
    budgetAmount: budgetAmount
    budgetStartDate: budgetStartDate
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    name: replace('${prefix}${suffix}', '-', '')
    location: location
    tags: tags
  }
}

module sql 'modules/sql.bicep' = {
  name: 'sql'
  params: {
    serverName: '${prefix}-sql-${suffix}'
    location: location
    tags: tags
    adminLogin: sqlAdminLogin
    adminPassword: sqlAdminPassword
  }
}

var sqlConnectionString = 'Server=tcp:${sql.outputs.fqdn},1433;Database=${sql.outputs.databaseName};User Id=${sqlAdminLogin};Password=${sqlAdminPassword};Encrypt=True;Connection Timeout=30'

module environment 'modules/aca-environment.bicep' = {
  name: 'aca-environment'
  params: {
    name: '${prefix}-env'
    location: location
    tags: tags
    workspaceName: monitoring.outputs.workspaceName
  }
}

module app 'modules/aca-app.bicep' = {
  name: 'aca-app'
  params: {
    name: '${prefix}-api'
    location: location
    tags: tags
    environmentId: environment.outputs.id
    image: image
    sqlConnectionString: sqlConnectionString
    entraTenantId: entraTenantId
    entraClientId: entraClientId
    entraClientSecret: entraClientSecret
    allowedOids: allowedOids
    storageAccountName: storage.outputs.name
    dataProtectionBlobUri: storage.outputs.dataProtectionBlobUri
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    customDomain: customDomain
    customDomainCertificateId: customDomainCertificateId
    allowedIpRanges: restrictIngressToCloudflare ? cloudflareRanges : []
  }
}

module jobs 'modules/aca-jobs.bicep' = {
  name: 'aca-jobs'
  params: {
    prefix: prefix
    location: location
    tags: tags
    environmentId: environment.outputs.id
    image: image
    sqlConnectionString: sqlConnectionString
    allowedOids: allowedOids
    actionGroupId: monitoring.outputs.actionGroupId
  }
}

module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    name: '${prefix}-deploy'
    location: location
    tags: tags
    githubRepo: githubRepo
  }
}

// What the runbook needs after a deploy: the GitHub variables, and the DNS records for the custom domain.
output deployClientId string = identity.outputs.clientId
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
output apiFqdn string = app.outputs.fqdn
output customDomainVerificationId string = app.outputs.customDomainVerificationId
output sqlServerFqdn string = sql.outputs.fqdn
