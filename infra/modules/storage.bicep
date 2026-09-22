// The Data Protection key ring (design 5.4): one blob, read and written by the app's managed identity. No keys, no
// connection string, no public access; shared-key access is off so the identity is the only way in.
param name string
param location string
param tags object

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }

  resource blobs 'blobServices' = {
    name: 'default'

    resource dataProtection 'containers' = {
      name: 'dataprotection'
    }
  }
}

output name string = account.name
output dataProtectionBlobUri string = '${account.properties.primaryEndpoints.blob}${account::blobs::dataProtection.name}/keys.xml'
