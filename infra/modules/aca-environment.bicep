// The Container Apps environment: the boundary the app and the three jobs share, sending console logs to the workspace.
param name string
param location string
param tags object
param workspaceName string

// Created by monitoring.bicep; referenced here by name so this module can read its key without the key crossing a
// module boundary as an output.
resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: workspaceName
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
  }
}

output id string = environment.id
