// The three jobs, all the same image as the API with the entry point swapped (design decisions 6 and 13):
// migrate, started by the deploy workflow before the new revision goes live; rollover, hourly; demo-reset, nightly.
// Cron expressions are UTC: 17:00 UTC is 03:00 AEST. A failed execution of a scheduled job raises an alert.
param prefix string
param location string
param tags object
param environmentId string
param image string
@secure()
param sqlConnectionString string
param allowedOids string
param actionGroupId string

var jobs = [
  { name: 'migrate', cron: '', timeout: 1800, retries: 0 }
  { name: 'rollover', cron: '5 * * * *', timeout: 300, retries: 1 }
  { name: 'demo-reset', cron: '0 17 * * *', timeout: 300, retries: 1 }
]

resource job 'Microsoft.App/jobs@2024-03-01' = [for j in jobs: {
  name: '${prefix}-${j.name}'
  location: location
  tags: tags
  properties: {
    environmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: empty(j.cron) ? 'Manual' : 'Schedule'
      replicaTimeout: j.timeout
      replicaRetryLimit: j.retries
      manualTriggerConfig: empty(j.cron) ? { parallelism: 1, replicaCompletionCount: 1 } : null
      scheduleTriggerConfig: empty(j.cron) ? null : { cronExpression: j.cron, parallelism: 1, replicaCompletionCount: 1 }
      secrets: [{ name: 'sql-connection', value: sqlConnectionString }]
    }
    template: {
      containers: [
        {
          name: j.name
          image: image
          command: ['dotnet', 'jobs/Budget.Jobs.dll', j.name]
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'ConnectionStrings__Budget', secretRef: 'sql-connection' }
            { name: 'Auth__AllowedOids', value: allowedOids }
          ]
        }
      ]
    }
  }
}]

// The migrate job is watched by the workflow that starts it; the scheduled two are watched here.
resource failedExecution 'Microsoft.Insights/metricAlerts@2018-03-01' = [for (j, i) in jobs: if (!empty(j.cron)) {
  name: '${prefix}-${j.name}-failed'
  location: 'global'
  tags: tags
  properties: {
    description: 'The ${j.name} job had a failed execution in the last hour.'
    severity: 2
    enabled: true
    scopes: [job[i].id]
    evaluationFrequency: 'PT1H'
    windowSize: 'PT1H'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'failed'
          metricNamespace: 'Microsoft.App/jobs'
          metricName: 'Executions'
          dimensions: [{ name: 'state', operator: 'Include', values: ['Failed'] }]
          operator: 'GreaterThan'
          threshold: 0
          timeAggregation: 'Total'
        }
      ]
    }
    actions: [{ actionGroupId: actionGroupId }]
    autoMitigate: true
  }
}]
