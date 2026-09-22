import { expect, test } from '@playwright/test'

// The one spec that signs in through the screen. Every other spec starts from the cookie auth.setup.ts saved, because
// /auth/* allows five requests a minute and a sign-in per spec would run through that in no time.
test.use({ storageState: { cookies: [], origins: [] } })

test('Try the demo signs in and lands on Home with the demo budget', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('The demo is shared and resets every night.')).toBeVisible()

  await page.getByRole('button', { name: 'Try the demo' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Groceries/ })).toBeVisible()
})
