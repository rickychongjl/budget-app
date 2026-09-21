# Playwright setup (one-time, before the M8 specs)

What this covers: getting a green `npx playwright test` against `docker compose`, signed in as the demo user, with the fixture data in place. It does not write any story specs — that is M8 proper (`docs/user-stories.md`, one spec per story).

Settled elsewhere, not re-decided here: Playwright over the alternatives, `tests/e2e` as the home, the iPhone 15 profile, local by default with an optional `workflow_dispatch` in CI, and `fixtures/demo-seed.json` as the data (`docs/solution-design.md` sections 9, 13, 14 and decision 8).

## 0. What you already have

- `tests/e2e/fixtures/demo-seed.json` — the fixture, already shared with the `reset-demo` job (the Dockerfile copies it into the image).
- `docker compose up -d --build` — SQL, then `migrate` (which seeds the demo when the database is empty), then the API serving the **built** SPA on `http://localhost:8080`.
- A demo sign-in that needs no secrets: `GET /auth/csrf`, then `POST /auth/demo` with the token in `X-XSRF-TOKEN`.
- Demo user: display name "Demo", time zone `Australia/Sydney`, currency AUD.

Missing: everything under `tests/e2e` except the fixture.

## 1. The npm project

Playwright gets its own project in `tests/e2e`, separate from `src/web`. Three reasons: `@playwright/test` and Vitest both export `test`/`expect` and would fight over the same `tsconfig`; the API Dockerfile runs `npm ci` in `src/web` and must not pull a browser driver; and the e2e specs depend on nothing in the web source.

```
tests/e2e/
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── auth.setup.ts
├── global-setup.ts
├── fixtures/
│   └── demo-seed.json      ← already here
├── specs/
│   └── smoke.spec.ts
└── .auth/                  ← gitignored; the saved session cookie
```

```bash
cd tests/e2e
npm init -y
npm i -D @playwright/test@latest @types/node
npx playwright install webkit chromium
```

Browsers: the iPhone 15 profile is WebKit (`defaultBrowserType: "webkit"`), so WebKit is the one that matters. Chromium is worth the extra download for two things only — service-worker introspection, which Playwright supports in Chromium alone, and `--ui` debugging. Skip Firefox. Both land in `%USERPROFILE%\AppData\Local\ms-playwright` (~1 GB); nothing goes in the repo.

`package.json` scripts — this is the `test:e2e` target the design doc lists as planned:

```json
{
  "name": "budget-e2e",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "report": "playwright show-report"
  }
}
```

## 2. `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8080'

export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup.ts',
  // One shared demo tenant: parallel workers would write over each other's rows.
  workers: 1,
  fullyParallel: false,
  // Retrying a spec that has already mutated the demo hides the bug instead of proving it.
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // The server decides "today" in the user's zone; the browser must agree or date assertions drift.
    timezoneId: 'Australia/Sydney',
    locale: 'en-AU',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'iphone',
      use: { ...devices['iPhone 15'], storageState: '.auth/demo.json' },
      dependencies: ['setup'],
    },
    // Service-worker specs only: context.serviceWorkers() is Chromium-only.
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
  },
})
```

Notes on the choices that are not obvious:

- **`workers: 1`.** The demo user is one row set, shared by every spec. This is the cost of decision 14 (the demo is a normal user, not a special case) and it is the right trade: one tenant, one worker. Do not reach for per-worker users — the app deliberately has no registration endpoint.
- **`webServer` with `docker compose`.** `up -d` returns straight away; Playwright then polls `url` until it answers. `/health` is liveness and touches no database, so it goes green the moment the API is listening — which is after `migrate` has completed, because compose orders it that way. `reuseExistingServer` keeps the loop fast when the stack is already up.
- **`timezoneId`.** Every date in the app is `todayIn(me.timeZone)`. If the browser sits in a different zone the specs will pass for most of the day and fail near midnight.
- **No `baseURL` pointing at Vite.** `npm run dev` does not register the service worker and serves unbundled modules; M8 is precisely about the PWA, so the specs must run against the image.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["node"],
    "noEmit": true
  }
}
```

## 3. Signing in once

`/auth/*` is rate limited to **5 requests a minute per address** (`RateLimiting.AuthPolicy`). A sign-in per spec would hit that within a handful of tests. So: one setup project signs in through the API, saves the cookie, and every other spec starts already signed in.

```ts
// auth.setup.ts
import { test as setup, expect } from '@playwright/test'

const file = '.auth/demo.json'

setup('sign in as the demo user', async ({ request }) => {
  // The request token comes from the body; the cookie half is HttpOnly and set by the same call.
  const csrf = await request.get('/auth/csrf')
  expect(csrf.ok()).toBeTruthy()
  const { token } = await csrf.json()

  const signIn = await request.post('/auth/demo', { headers: { 'X-XSRF-TOKEN': token } })
  expect(signIn.status()).toBe(204)

  await request.storageState({ path: file })
})
```

- The session cookie is `HttpOnly`, `SameSite=Strict`, and lives a fixed four hours without sliding. That covers a run; if a stale `.auth/demo.json` ever lands you on the sign-in screen instead of the app, delete the file.
- The SPA fetches its own antiforgery token on load, so specs that click through the UI need nothing further.
- Keep **one** spec that signs in through the interface so the real path stays covered — give it `storageState: { cookies: [], origins: [] }` and go to `/`: signed out, `SessionGate` renders the sign-in screen at every path, so the `Try the demo` button is there.

## 4. Resetting the data

`reset-demo` deletes every demo row and rebuilds the fixture through the real domain rules, with each date an offset from today. Run it once before the suite:

```ts
// global-setup.ts
import { execFileSync } from 'node:child_process'

export default function () {
  execFileSync(
    'docker',
    ['compose', 'run', '--rm', '--entrypoint', 'dotnet jobs/Budget.Jobs.dll reset-demo', 'migrate'],
    { cwd: new URL('../..', import.meta.url).pathname.slice(1), stdio: 'inherit' },
  )
}
```

This runs after `webServer` has the stack up, which is the order you want — the job needs SQL.

**The one gap that needs code.** Onboarding stories 1 to 5 need a demo user with *no* data, and `reset-demo` always re-seeds. The cheapest fix is a flag on the job that stops after the delete:

```csharp
// Budget.Jobs/Program.cs
case ["reset-demo"]:
    return await JobHost.ResetDemoAsync(services);

case ["reset-demo", "--empty"]:
    return await JobHost.ResetDemoAsync(services, empty: true);
```

with `JobHost.ResetDemoAsync` calling `users.DeleteDataAsync(demo.Id)` and returning before `ResetDemo.RunAsync`. About five lines plus an Application test. The onboarding spec then empties the demo in a `beforeAll` and the next spec's reset puts it back — so keep onboarding in its own file and let it run last (`testMatch` order, or name it `zz-onboarding.spec.ts`).

Do not seed by writing SQL from a spec. The fixture goes in through the domain rules, which is the only reason the seeded cycles have correct rollups and carry-forward.

## 5. Offline and the service worker

This is why M8 needs Playwright at all — jsdom cannot express it.

- `await context.setOffline(true)` works in every browser. That is the tool for the outbox specs: go offline, add a transaction, assert the screen shows it (that is `overlay(server snapshot, outbox)`), go back online, assert `drain()` posted it and the server's numbers now match.
- `context.serviceWorkers()` and `context.waitForEvent('serviceworker')` are **Chromium only**. Any spec that asserts the worker installed, or that a cold reload is served from its cache, belongs in the `sw` project. Story specs stay on the iPhone 15 profile.
- Each test gets a fresh context, so the worker installs again every time. If a spec needs an already-installed worker across steps, use `test.describe.serial` and install it in the first step rather than fighting the isolation.
- After any change under `src/web`, rebuild before running: `docker compose up -d --build`. A stale image is the single most likely cause of a spec that fails for no visible reason.

## 6. Writing the specs

- Locate by role and name (`getByRole('button', { name: 'Try the demo' })`), never by CSS class — the class names are CSS-module hashes and will change.
- Status in this app is always colour **plus icon plus word**, so assert on the word. Never assert on a colour.
- Amounts come from the shared money formatter in AUD; assert on the formatted string (`$1,234.50`) or on an accessible name, not on a raw number.
- Dates in assertions derive from the fixture's offsets, not from `new Date()` in the spec process.
- The file-name case rule from M6 applies here too: no two files in a folder differing only by case or extension.

## 7. Ignore rules

`node_modules/` and `test-results/` are already covered by the root `.gitignore`. Add:

```gitignore
tests/e2e/.auth/
tests/e2e/playwright-report/
tests/e2e/blob-report/
tests/e2e/.last-run.json
```

The report and the traces are throwaway; the saved cookie must never be committed even though it is only a demo session.

## 8. CI (optional, `workflow_dispatch`)

```yaml
# .github/workflows/e2e.yml
name: e2e
on: workflow_dispatch

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: src/web/.nvmrc
      - run: echo "MSSQL_SA_PASSWORD=${{ secrets.E2E_SA_PASSWORD }}" > .env
      - run: npm ci
        working-directory: tests/e2e
      - run: npx playwright install --with-deps webkit chromium
        working-directory: tests/e2e
      - run: npm test
        working-directory: tests/e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: tests/e2e/playwright-report/
```

It stays `workflow_dispatch`: the constraint on e2e in CI is hassle, not cost (decision 8). `ci.yml` is untouched.

## 9. Seeing the tests: UI mode

Playwright ships its own dashboard, no service and no extra dependency.

```bash
cd tests/e2e
npx playwright test --ui
```

It opens a local app with every test in a tree by file and project (`setup`, `iphone`, `sw`), filterable by status, project or tag. Pick one, run it, and the right-hand side gives the action timeline: hover any step for the DOM snapshot at that moment, plus source, console, network and errors. There is a watch toggle that re-runs a test when its file changes. Use it as the debugging loop; use `npx playwright test` for a clean full run.

**The caveat for this repo:** global setup is a session-level step in UI mode, run once when the session starts — re-running a test from the tree does **not** re-run `global-setup.ts`, so the demo is not reset between attempts. A spec that mutates data will see what the previous attempt left behind. Reset by hand when that bites:

```bash
docker compose run --rm --entrypoint "dotnet jobs/Budget.Jobs.dll reset-demo" migrate
```

The other three views, none of which need UI mode:

- `npx playwright show-report` — the HTML report of the last run: every test with status and duration, and the trace, video and screenshot of each failure attached. Already configured above, and it is what the CI job uploads.
- `npx playwright show-trace test-results/<...>/trace.zip` — the same timeline as UI mode for one recorded run. This is how you read a CI failure locally.
- The **Playwright Test for VSCode** extension — the same tree in the editor's Test Explorer, with run and debug from the gutter and a "record new test" button. Optional; UI mode does everything it does except breakpoints.

There is no hosted Playwright dashboard in the box. (Microsoft sells one — Azure Playwright Testing, cloud browsers plus reporting — and it is not worth it for a suite that runs on demand on one machine.)

## 10. Windows notes

- Docker Desktop must be running; the stack takes ports 8080 and 1434, and `.env` must exist with `MSSQL_SA_PASSWORD`.
- `--debug` steps through one spec with the inspector, when UI mode is not enough.
- Browsers install per user, not per project, so a second clone of the repo needs no second download.

## 11. Prove the setup before writing any story spec

```ts
// specs/smoke.spec.ts
import { test, expect } from '@playwright/test'

test('the demo lands on its current cycle', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Groceries')).toBeVisible()
})

test('offline, the page still renders from the cache', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('Groceries')).toBeVisible()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Groceries')).toBeVisible()
})
```

The first test proves the config, the sign-in and the seed. The second is the M8 acceptance criterion in miniature and is **expected to fail until the service worker exists** — that is the red test M8 starts from.

Order to work through:

1. `docker compose up -d --build`, then check `http://localhost:8080` in a browser.
2. `cd tests/e2e && npm ci && npx playwright install webkit chromium`.
3. `npx playwright test --list` — proves the config parses and the projects resolve.
4. `npx playwright test specs/smoke.spec.ts --project=iphone` — the first test green, the second red for the right reason.
5. Only then start the story specs.
