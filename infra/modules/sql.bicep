// Azure SQL, Basic tier (design decision 5). Reachable only from Azure services, TLS 1.2, encrypted at rest by default,
// 7-day point-in-time restore. SQL authentication: the app reads a connection string from a Container Apps secret.
param serverName string
param location string
param tags object
param adminLogin string
@secure()
param adminPassword string

resource server 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: serverName
  location: location
  tags: tags
  properties: {
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }

  // The 0.0.0.0 rule is Azure's "Allow Azure services and resources to access this server". It is what lets the
  // Container Apps environment in without a VNet, which the Consumption plan does not have here.
  resource allowAzure 'firewallRules' = {
    name: 'AllowAllWindowsAzureIps'
    properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
  }

  resource database 'databases' = {
    name: 'budget'
    location: location
    tags: tags
    sku: { name: 'Basic', tier: 'Basic' }
    properties: {
      maxSizeBytes: 2147483648
      requestedBackupStorageRedundancy: 'Local'
    }
  }
}

output fqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = server::database.name
