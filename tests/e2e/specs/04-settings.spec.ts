import { expect, test } from '@playwright/test'
import { addDays, categoryRow, currentCycleStartOffset, cycleCount, today } from '../support'

// docs/user-stories.md, "Settings". Serial: the later stories build on what the earlier ones changed.
test.describe.configure({ mode: 'serial' })

const currentStart = () => addDays(today(), currentCycleStartOffset)

test('Settings 1, 7: a budget changed in the current cycle does not change a past cycle', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Categories and budgets' }).click()
  await page.getByRole('button', { name: 'Edit Groceries' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Groceries' })
  await sheet.getByLabel('Budget').fill('750')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Groceries' }).locator('..')).toContainText('$750.00')

  await page.goto('/')
  await expect(categoryRow(page, 'Groceries')).toContainText('/ $750.00')

  // The snapshot rule: the cycle before still has the budget it was lived with.
  await page.goto('/cycles')
  await page.getByRole('link', { name: /Past/ }).first().click()
  await expect(categoryRow(page, 'Groceries')).toContainText('/ $700.00')
})

test('Settings 2, 11.2: every cycle is listed with its dates, and the current one carries the categories forward', async ({ page }) => {
  await page.goto('/cycles')
  const rows = page.getByRole('link', { name: /Current|Past|Upcoming/ })
  await expect(rows).toHaveCount(cycleCount)
  await expect(rows.first()).toContainText('Current')
  await expect(rows.first().getByRole('heading', { level: 2 })).toHaveText(/\d+ \w+ to \d+ \w+/)

  // The rollover copied the categories, with no action from the user: same names, in the same order, in every cycle.
  await rows.first().click()
  const current = await page.getByRole('heading', { level: 3 }).allTextContents()
  await page.goBack()
  await rows.nth(1).click()
  expect(await page.getByRole('heading', { level: 3 }).allTextContents()).toEqual(current)
})

test('Settings 3, 4, 5, 6: only the current start date moves, never into the previous cycle, and its transactions stay', async ({ page }) => {
  await page.goto('/settings')
  const field = page.getByLabel('Start date')
  await expect(field).toHaveValue(currentStart())
  // No end date to set: it is always 29 days on.
  await expect(page.getByLabel('End date')).toHaveCount(0)
  await expect(page.getByText(/A cycle is always 30 days\./)).toBeVisible()

  // Into the previous cycle: refused by the server, said under the field.
  await field.fill(addDays(currentStart(), -2))
  await page.getByRole('button', { name: 'Move start date' }).click()
  const dialog = page.getByRole('dialog', { name: 'Move the start date?' })
  await expect(dialog).toContainText('This also moves every upcoming cycle. Past cycles stay as they are.')
  await dialog.getByRole('button', { name: 'Move' }).click()
  await expect(field).toHaveAttribute('aria-invalid', 'true')

  // One day later: allowed, after the same confirmation.
  await field.fill(addDays(currentStart(), 1))
  await page.getByRole('button', { name: 'Move start date' }).click()
  await dialog.getByRole('button', { name: 'Move' }).click()
  await expect(page.getByText('Start date moved')).toBeVisible()

  // The pay that came in on the old first day is now dated before the cycle starts, and is still counted in it.
  await page.goto('/')
  await expect(page.getByText(/received of \$5,200\.00 expected/)).toBeVisible()
  await expect(categoryRow(page, 'Salary')).toContainText('$5,20')
})

test('Settings 9, 10: a category can be added mid-cycle, and removed only while it has no transactions', async ({ page }) => {
  await page.goto('/settings/categories')
  await page.getByRole('button', { name: 'Add category' }).click()
  const add = page.getByRole('dialog', { name: 'Add category' })
  await add.getByLabel('Name').fill('Gifts')
  await add.getByLabel('Budget').fill('100')
  await add.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 3, name: 'Gifts' })).toBeVisible()

  await page.getByRole('button', { name: 'Edit Gifts' }).click()
  await page.getByRole('button', { name: 'Remove from this cycle' }).click()
  await page.getByRole('dialog', { name: 'Remove Gifts?' }).getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Removed from this cycle', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Gifts' })).toHaveCount(0)

  // Groceries has transactions this cycle, so the server says no and the sheet says why.
  await page.getByRole('button', { name: 'Edit Groceries' }).click()
  await page.getByRole('button', { name: 'Remove from this cycle' }).click()
  await page.getByRole('dialog', { name: 'Remove Groceries?' }).getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit Groceries' }).getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Groceries' })).toBeVisible()
})

test('Settings 11, 13: a past cycle\'s closing balance can still be entered, and becomes the next opening balance', async ({ page }) => {
  await page.goto('/cycles')
  await page.getByRole('link', { name: /Past/ }).first().click()
  await page.getByLabel('Closing balance').fill('3700')
  await page.getByRole('button', { name: 'Save balance' }).click()
  await expect(page.getByText("Saved. It is now the next cycle's opening balance.")).toBeVisible()

  await page.goto('/cycles')
  await page.getByRole('link', { name: /Current/ }).click()
  await expect(page.getByText('Opening balance').locator('..')).toContainText('$3,700.00')
})

test('Settings 12: a past cycle\'s categories, budgets and start date are not offered for editing', async ({ page }) => {
  await page.goto('/settings/categories')
  // Only the current cycle (and any upcoming one) can be picked; no past cycle is in the list.
  const options = page.getByLabel('Cycle').locator('option')
  await expect(options).toHaveCount(1)
  await expect(options.first()).toHaveText(/\(current\)$/)

  await page.goto('/cycles')
  await page.getByRole('link', { name: /Past/ }).first().click()
  await expect(page.getByRole('button', { name: 'Move start date' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0)
})
