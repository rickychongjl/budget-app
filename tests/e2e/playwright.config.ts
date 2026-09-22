import { defineConfig, devices } from '@playwright/test'

// docs/playwright_setup.md explains each choice. In short: the specs run against the docker compose stack (the built
// SPA, the real API, real SQL), as the one shared demo user, so one worker and no retries.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8080'

export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // "Today" is the demo user's, in Sydney; the browser has to agree or a date assertion drifts near midnight.
    timezoneId: 'Australia/Sydney',
    locale: 'en-AU',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'iphone',
      testIgnore: /.*\.sw\.spec\.ts/,
      use: { ...devices['iPhone 15'], storageState: '.auth/demo.json' },
      dependencies: ['setup'],
    },
    // The service worker specs only: looking at the worker is a Chromium-only API.
    {
      name: 'sw',
      testMatch: /.*\.sw\.spec\.ts/,
      use: { ...devices['Pixel 7'], storageState: '.auth/demo.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'docker compose up -d --build',
    cwd: '../..',
    url: `${baseURL}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // One address, one worker, and every page load counts its assets: the default 100 a minute is spent in seconds.
    // A stack started by hand needs the same in .env, or the run ends in 429s.
    env: { RATE_LIMIT_PERMIT: '2000' },
  },
})
