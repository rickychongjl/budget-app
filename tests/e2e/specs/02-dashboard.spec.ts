import { expect, test } from '@playwright/test'
import { categoryRow, fixture, fixtureSpent, money } from '../support'

// docs/user-stories.md, "Dashboard overview". Read-only: the fixture already has a category over its limit.
test('Dashboard 1: every category is shown against its budget, and being over is said in colour, icon and word', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()

  // Every category of the current cycle, under its own heading, with spent against budget.
  for (const category of fixture.categories) {
    await expect(categoryRow(page, category.name)).toContainText(`${money(fixtureSpent(category.key))} / ${money(category.budget)}`)
  }
  await expect(page.getByRole('region', { name: 'Spending' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Income' })).toBeVisible()

  // "Eating out" is over: the bar says so, and so does the word next to its icon. Never colour alone.
  const dining = fixture.categories.find((c) => c.key === 'dining')!
  const over = fixtureSpent('dining') - dining.budget
  expect(over).toBeGreaterThan(0)
  await expect(categoryRow(page, dining.name)).toContainText(`Over by ${money(over)}`)
  await expect(page.locator(`[role="progressbar"][aria-valuetext^="${dining.name}: "]`)).toHaveAttribute('aria-valuetext', /Over by/)

  // Salary came in exactly as expected: positive, with its own word.
  await expect(categoryRow(page, 'Salary')).toContainText('Received')
})
