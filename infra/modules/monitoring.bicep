// Log Analytics (the Container Apps console logs land here too), Application Insights on top of it, the action group
// every alert notifies, the two request alerts from design section 12 and the cost budget. Job alerts sit with the jobs.
param prefix string
param location string
param tags object
param alertEmail string
param budgetAmount int
param budgetStartDate string

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-log'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-ai'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    IngestionMode: 'LogAnalytics'
  }
}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: '${prefix}-alerts'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'budget'
    enabled: true
    emailReceivers: [{ name: 'owner', emailAddress: alertEmail, useCommonAlertSchema: true }]
  }
}

// Log alerts, because a failure *rate* and a percentile are not platform metrics. Every fifteen minutes, not five:
// a log alert is priced by frequency and fifteen is the cheapest tier, which is right for a one-user app.
var requestAlerts = [
  {
    name: 'failure-rate'
    description: 'More than 5% of requests failed in the last 15 minutes.'
    query: 'requests | where timestamp > ago(15m) | summarize failed = countif(success == false), total = count() | where total >= 20 | where 100.0 * failed / total > 5'
  }
  {
    name: 'p95-latency'
    description: 'P95 request duration above 1 s over the last 15 minutes.'
    query: 'requests | where timestamp > ago(15m) | summarize p95 = percentile(duration, 95) | where p95 > 1000'
  }
]

resource requestAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = [for alert in requestAlerts: {
  name: '${prefix}-${alert.name}'
  location: location
  tags: tags
  properties: {
    displayName: alert.name
    description: alert.description
    severity: 2
    enabled: true
    evaluationFrequency: 'PT15M'
    windowSize: 'PT15M'
    scopes: [appInsights.id]
    criteria: {
      allOf: [
        {
          query: alert.query
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: { numberOfEvaluationPeriods: 1, minFailingPeriodsToAlert: 1 }
        }
      ]
    }
    actions: { actionGroups: [actionGroup.id] }
    autoMitigate: true
  }
}]

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: '${prefix}-budget'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStartDate }
    notifications: {
      forecast80: { enabled: true, operator: 'GreaterThan', threshold: 80, thresholdType: 'Forecasted', contactEmails: [alertEmail] }
      actual100: { enabled: true, operator: 'GreaterThan', threshold: 100, thresholdType: 'Actual', contactEmails: [alertEmail] }
    }
  }
}

output workspaceName string = workspace.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output actionGroupId string = actionGroup.id
