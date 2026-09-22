// The API and the SPA it serves: one Container App, external ingress on 443, one to three replicas, a system-assigned
// identity that may read and write the Data Protection blob. Secrets are Container Apps secrets referenced by name.
param name string
param location string
param tags object
param environmentId string
param image string
@secure()
param sqlConnectionString string
param entraTenantId string
param entraClientId string
@secure()
param entraClientSecret string
param allowedOids string
param storageAccountName string
param dataProtectionBlobUri string
param appInsightsConnectionString string
param customDomain string
param customDomainCertificateId string
param allowedIpRanges array

var hasEntra = !empty(entraClientSecret)

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    environmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        // Empty means open. With Cloudflare's ranges here, the origin answers Cloudflare only (design section 6).
        ipSecurityRestrictions: [for (range, i) in allowedIpRanges: { name: 'allow-${i}', ipAddressRange: range, action: 'Allow' }]
        // Two steps: the domain is added without a certificate, `az containerapp hostname bind` issues one, and from
        // then on the deploy carries its id. Declared here so a redeploy does not drop the binding.
        customDomains: empty(customDomain) ? [] : [
          {
            name: customDomain
            bindingType: empty(customDomainCertificateId) ? 'Disabled' : 'SniEnabled'
            certificateId: empty(customDomainCertificateId) ? null : customDomainCertificateId
          }
        ]
      }
      secrets: concat(
        [{ name: 'sql-connection', value: sqlConnectionString }],
        hasEntra ? [{ name: 'entra-client-secret', value: entraClientSecret }] : []
      )
    }
    template: {
      containers: [
        {
          name: 'api'
          image: image
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: concat(
            [
              { name: 'ConnectionStrings__Budget', secretRef: 'sql-connection' }
              { name: 'Auth__AllowedOids', value: allowedOids }
              { name: 'DataProtection__BlobUri', value: dataProtectionBlobUri }
              { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            ],
            hasEntra ? [
              { name: 'Entra__TenantId', value: entraTenantId }
              { name: 'Entra__ClientId', value: entraClientId }
              { name: 'Entra__ClientSecret', secretRef: 'entra-client-secret' }
            ] : []
          )
          // Liveness only, and never the database: /health/ready is for dashboards (design section 12).
          probes: [
            { type: 'Startup', httpGet: { path: '/health', port: 8080 }, periodSeconds: 5, failureThreshold: 30 }
            { type: 'Liveness', httpGet: { path: '/health', port: 8080 }, periodSeconds: 30 }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [{ name: 'http', http: { metadata: { concurrentRequests: '50' } } }]
      }
    }
  }
}

// Created by storage.bicep; the role is scoped to the one container, not the account.
resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' existing = {
  name: '${storageAccountName}/default/dataprotection'
}

var storageBlobDataContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')

// A role assignment's name is a GUID that must be the same on every deploy, or the second one tries to add a duplicate.
resource keyRingAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(container.id, app.id, storageBlobDataContributor)
  scope: container
  properties: {
    roleDefinitionId: storageBlobDataContributor
    principalId: app.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output fqdn string = app.properties.configuration.ingress.fqdn
output customDomainVerificationId string = app.properties.customDomainVerificationId
