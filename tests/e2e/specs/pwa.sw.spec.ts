import { expect, test } from '@playwright/test'
import { categoryRow } from '../support'

// Design section 7, "Service worker" and "Install". Chromium only (playwright.config.ts): looking at the worker is a
// Chromium-only API, and it is the browser that installs from a manifest.
async function workerReady(page: import('@playwright/test').Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  // Precaching finishes after activation; the shell is not usable offline until it has.
  await page.waitForFunction(() => caches.keys().then((keys) => keys.some((key) => key.startsWith('workbox-precache'))))
}

test('the manifest describes an installable app', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBeTruthy()
  const body = (await manifest.json()) as { name: string; display: string; start_url: string; icons: { sizes: string; purpose?: string }[] }
  expect(body.name).toBe('Budget')
  expect(body.display).toBe('standalone')
  expect(body.start_url).toBe('/')
  expect(body.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')).toBeTruthy()
  for (const icon of ['/pwa-192.png', '/pwa-512.png', '/apple-touch-icon.png']) {
    expect((await request.get(icon)).ok(), icon).toBeTruthy()
  }
})

test('the app opens with no signal: the worker serves the shell and the last budget is drawn from the cache', async ({ page, context }) => {
  await page.goto('/')
  await expect(categoryRow(page, 'Groceries')).toBeVisible()
  await workerReady(page)
  expect(context.serviceWorkers()).toHaveLength(1)
  // The visit that installed the worker was not served by it; the next one is, and that is when /api/me is kept.
  await page.reload()
  await expect(categoryRow(page, 'Groceries')).toBeVisible()

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()
  await expect(categoryRow(page, 'Groceries')).toBeVisible()
  await expect(page.getByText("Offline. Changes will sync when you're back online.")).toBeVisible()
})

test('the API and auth are never served as a page', async ({ page, context }) => {
  await page.goto('/')
  await workerReady(page)
  await context.setOffline(true)

  // Without the denylist the worker would answer these with index.html.
  await expect(page.goto('/api/me')).rejects.toThrow()
  await expect(page.goto('/auth/csrf')).rejects.toThrow()
})
