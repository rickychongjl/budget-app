// How GitHub Actions deploys without a stored credential: a user-assigned identity with a federated credential that
// trusts tokens GitHub issues for this repository's main branch, and Contributor on the resource group.
param name string
param location string
param tags object
param githubRepo string

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: name
  location: location
  tags: tags

  resource github 'federatedIdentityCredentials' = {
    name: 'github-main'
    properties: {
      issuer: 'https://token.actions.githubusercontent.com'
      subject: 'repo:${githubRepo}:ref:refs/heads/main'
      audiences: ['api://AzureADTokenExchange']
    }
  }
}

var contributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')

resource deployAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, identity.id, contributor)
  properties: {
    roleDefinitionId: contributor
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output clientId string = identity.properties.clientId
