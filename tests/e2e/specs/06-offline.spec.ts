import { expect, test } from '@playwright/test'
import { addTransaction, categoryRow } from '../support'

// Design section 7, "Offline-first" and "What works offline": with the tab open and the network gone. A cold start
// with no network needs the service worker and is pwa.sw.spec.ts.
test('a transaction added offline shows at once, is counted as waiting, and is sent when the connection returns', async ({ page, context }) => {
  await page.goto('/')
  await expect(categoryRow(page, 'Fun')).toContainText('$45.00 / $200.00')

  await context.setOffline(true)
  await expect(page.getByText("Offline. Changes will sync when you're back online.")).toBeVisible()

  await addTransaction(page, { amount: '7', category: 'Fun', note: 'Offline arcade' })

  // overlay(server snapshot, outbox): the screen already counts it.
  await expect(categoryRow(page, 'Fun')).toContainText('$52.00 / $200.00')
  await expect(page.getByText('Offline. 1 change waiting to sync.')).toBeVisible()

  await context.setOffline(false)
  await page.reload()
  await expect(page.getByText(/waiting to sync/)).toHaveCount(0)
  // Still there after a reload, so it came back from the server, not the outbox.
  await expect(categoryRow(page, 'Fun')).toContainText('$52.00 / $200.00')
  await categoryRow(page, 'Fun').click()
  await expect(page.getByRole('button', { name: /Offline arcade/ })).toContainText('$7.00')
})

test('adding or removing a category needs a connection, and says so instead of failing', async ({ page, context }) => {
  await page.goto('/settings/categories')
  await expect(page.getByRole('button', { name: 'Add category' })).toBeEnabled()

  await context.setOffline(true)
  await expect(page.getByRole('button', { name: 'Add category' })).toBeDisabled()
  await expect(page.getByText('Adding or removing a category needs a connection.')).toBeVisible()

  // Editing still works: it goes through the outbox.
  await page.getByRole('button', { name: 'Edit Fun' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Fun' })
  await expect(sheet.getByRole('button', { name: 'Remove from this cycle' })).toBeDisabled()
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeEnabled()
})
