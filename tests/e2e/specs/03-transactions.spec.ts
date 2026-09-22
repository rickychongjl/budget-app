import { expect, test } from '@playwright/test'
import { addTransaction, categoryRow, fixtureSpent, money, today } from '../support'

// docs/user-stories.md, "Transactions". These add to the shared demo; the specs after this one allow for it.
test.describe.configure({ mode: 'serial' })

test('Transactions 1: spending is entered on the keypad and filed under a debit category', async ({ page }) => {
  await page.goto('/')
  const before = fixtureSpent('groceries')
  await expect(categoryRow(page, 'Groceries')).toContainText(`${money(before)} /`)

  await addTransaction(page, { amount: '42', category: 'Groceries', note: 'Playwright groceries' })

  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await expect(categoryRow(page, 'Groceries')).toContainText(`${money(before + 42)} /`)
})

test('Transactions 2: income is entered the same way under a credit category', async ({ page }) => {
  await page.goto('/')
  await expect(categoryRow(page, 'Salary')).toContainText('Received')

  await addTransaction(page, { type: 'Income', amount: '1', category: 'Salary' })

  // One dollar over what was expected: ahead, in green, with its icon and word.
  await expect(categoryRow(page, 'Salary')).toContainText('Ahead by $1.00')
  await expect(page.getByText(/received of \$5,200\.00 expected/)).toContainText('$5,201.00')
})

test('Transactions 3: a new transaction goes into the current cycle, dated today', async ({ page }) => {
  await page.goto('/')
  await categoryRow(page, 'Groceries').click()

  await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible()
  const row = page.getByRole('button', { name: /Playwright groceries/ })
  await expect(row).toContainText('$42.00')
  // Dated today, as "22 Sep".
  await expect(row).toContainText(new RegExp(`\\b${Number(today().slice(8))} [A-Z][a-z]+`))
})

test('Transactions 4: editing or deleting in a past cycle asks about that cycle\'s closing balance', async ({ page }) => {
  await page.goto('/cycles')
  await page.getByRole('link', { name: /Past/ }).first().click()
  // The cycle's own page: its date range is the title.
  await expect(page.getByRole('heading', { level: 1, name: / to / })).toBeVisible()
  await categoryRow(page, 'Groceries').click()

  // Edit: the last digit of the first transaction's amount.
  await page.getByRole('button', { name: /Weekly shop/ }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Edit transaction' })
  await sheet.getByRole('button', { name: 'Backspace' }).click()
  await sheet.getByRole('button', { name: '5', exact: true }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()

  const prompt = page.getByRole('dialog', { name: 'You changed a past cycle' })
  await expect(prompt).toContainText('Update its closing balance too?')
  await prompt.getByRole('button', { name: 'Update balance' }).click()
  await expect(page.getByLabel('Closing balance')).toBeVisible()

  // Delete: the same question, declined this time.
  await categoryRow(page, 'Groceries').click()
  await page.getByRole('button', { name: /Weekly shop/ }).first().click()
  await page.getByRole('dialog', { name: 'Edit transaction' }).getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog', { name: 'Delete this transaction?' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Deleted', { exact: true })).toBeVisible()
  await prompt.getByRole('button', { name: 'Not now' }).click()
  await expect(prompt).toBeHidden()
})
