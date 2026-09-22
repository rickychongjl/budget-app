import { expect, test } from '@playwright/test'
import { categoryRow, cycleCount } from '../support'

// docs/user-stories.md, "Reporting". The chart is drawn by Recharts into an SVG, which is why this lives here and not
// in jsdom: the summary sentence, the filter and the table are what a person can read off it.
test('Reporting 1: every cycle is on one page', async ({ page }) => {
  await page.goto('/cycles')
  await expect(page.getByRole('link', { name: /Current|Past|Upcoming/ })).toHaveCount(cycleCount)
  await expect(page.getByRole('link', { name: /Past/ })).toHaveCount(cycleCount - 1)
})

test('Reporting 2: opening a cycle shows each category against the budget it had', async ({ page }) => {
  await page.goto('/cycles')
  await page.getByRole('link', { name: /Past/ }).first().click()

  await expect(page.getByText(/spent of \$[\d,.]+ budgeted/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Spending' }).getByRole('progressbar')).not.toHaveCount(0)
  await expect(categoryRow(page, 'Rent')).toContainText('$2,200.00 / $2,200.00')
})

test('Reporting 3: the trend across cycles, filtered by total, one category, or money accrued', async ({ page }) => {
  await page.goto('/cycles')
  const filter = page.getByRole('radiogroup', { name: 'What the chart shows' })
  await expect(filter.getByRole('radio', { name: 'Spending' })).toBeChecked()
  await expect(page.getByText(/finished cycles/)).toBeVisible()
  await expect(page.locator('svg.recharts-surface')).toBeVisible()

  await filter.getByRole('radio', { name: 'Category' }).click()
  await page.getByRole('radiogroup', { name: 'Category' }).getByRole('radio', { name: 'Rent' }).click()
  await expect(page.getByText(/^Rent (rose|fell|held steady) .*finished cycles/)).toBeVisible()

  await filter.getByRole('radio', { name: 'Accrued' }).click()
  await expect(page.getByText(/^Money accrued (rose|fell|held steady) .*finished cycles/)).toBeVisible()

  // The same numbers as a table, for whoever cannot read the line.
  await page.getByRole('button', { name: 'View as table' }).click()
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(cycleCount + 1)
})
