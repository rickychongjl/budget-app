import { expect, test } from '@playwright/test'
import { resetDemo } from '../global-setup'
import { categoryRow } from '../support'

// docs/user-stories.md, "Onboarding": the demo as a first sign-in finds it. Last in the run, because it starts by
// emptying the shared demo; the fixture is put back afterwards.
test.beforeAll(() => resetDemo('empty'))
test.afterAll(() => resetDemo())

test('Onboarding 1 to 5: from nothing to a confirmed first cycle', async ({ page }) => {
  await test.step('1: a first sign-in sees no data', async () => {
    await page.goto('/')
    await expect(page.getByText('No budget yet. Set up your first cycle.')).toBeVisible()
    await page.goto('/cycles')
    await expect(page.getByText('No cycles yet.')).toBeVisible()
    await page.goto('/')
    await page.getByRole('link', { name: 'Set up your first cycle' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Set up your budget' })).toBeVisible()
  })

  await test.step('3 and 4: the start date and opening balance; the length is fixed', async () => {
    // Today is offered; the end is stated, never asked for.
    await expect(page.getByLabel('Start date')).not.toHaveValue('')
    await expect(page.getByLabel('End date')).toHaveCount(0)
    await expect(page.getByText(/A cycle is always 30 days\./)).toBeVisible()
    await page.getByLabel('Opening balance').fill('3000')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible()
  })

  await test.step('5 (first half): nothing can be recorded, and the budget cannot be confirmed, until there is a category', async () => {
    await expect(page.getByRole('button', { name: 'Confirm budget' })).toBeDisabled()
    await expect(page.getByText('Add at least one category first.')).toBeVisible()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Add' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add transaction' })
    await expect(sheet).toContainText('Confirm your budget before adding transactions.')
    await sheet.getByRole('button', { name: 'Close' }).click()
  })

  await test.step('2: a debit category with a limit, and a credit category with an expected amount', async () => {
    await page.getByRole('button', { name: 'Add category' }).click()
    let sheet = page.getByRole('dialog', { name: 'Add category' })
    await expect(sheet.getByRole('radio', { name: 'Spending' })).toBeChecked()
    await sheet.getByLabel('Name').fill('Groceries')
    await expect(sheet.getByText('The most you plan to spend this cycle.')).toBeVisible()
    await sheet.getByLabel('Budget').fill('700')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('region', { name: 'Spending' }).getByRole('heading', { level: 3, name: 'Groceries' })).toBeVisible()

    await page.getByRole('button', { name: 'Add category' }).click()
    sheet = page.getByRole('dialog', { name: 'Add category' })
    await sheet.getByRole('radio', { name: 'Income' }).click()
    await sheet.getByLabel('Name').fill('Salary')
    await expect(sheet.getByText('What you expect to receive this cycle.')).toBeVisible()
    await sheet.getByLabel('Budget').fill('5200')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('region', { name: 'Income' }).getByRole('heading', { level: 3, name: 'Salary' })).toBeVisible()
  })

  await test.step('5: confirming opens the budget for transactions', async () => {
    await page.getByRole('button', { name: 'Confirm budget' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()
    await expect(page.getByText('spent of $700.00 budgeted')).toBeVisible()
    await expect(page.getByText('$0.00 received of $5,200.00 expected')).toBeVisible()
    await expect(categoryRow(page, 'Groceries')).toContainText('$0.00 / $700.00')
  })
})
