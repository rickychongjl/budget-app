# M8 plan: PWA (manifest, service worker, install, offline) and the Playwright user-story specs

Source: `docs/solution-design.md` section 7 ("Service worker", "Install", "What works offline"), section 9 (end-to-end row), section 13 and section 17 item 8; `docs/user-stories.md`, all of it; `docs/playwright_setup.md` (written first, as the plan for the e2e project). Picks up what M6 deferred here: the service worker, precache, manifest and icons, the install hint, and the automated check of the sheets' and dialogs' browser behaviour. One new dependency in `src/web`: `vite-plugin-pwa` (Workbox). One new npm project: `tests/e2e`.

## Status: implemented

Web: 327 tests (Vitest, 6 new in `src/pwa`), `oxlint` clean, `tsc -b` and `vite build` green; the build now also emits `sw.js`, `manifest.webmanifest` and a 10-entry precache (824 KiB). .NET: 338 tests (Domain 124, Application 90, Infrastructure 40, API 84), `dotnet build -warnaserror` clean. End-to-end: **22 Playwright tests in 8 files, all green in about a minute** against the built image, the real API and SQL Server: sign-in, every story in `docs/user-stories.md`, offline entry and sync, and the worker itself.

Where the code differs from the design, and why:

- **The worker caches one API answer, not `/api/cycles/*`.** Section 7 said stale-while-revalidate for the cycle endpoints. By M8 every answer was already kept whole in IndexedDB per user by `useCachedQuery`, stamped with when the server gave it; the overlay uses that stamp to decide which outbox rows the server has already counted. A worker-served copy would arrive as a fresh success with a stale body, the stamp would move, and queued rows would vanish from the screen. What the worker does cache is `GET /api/me`, network-first, because `SessionGate` cannot render anything until it answers and a cold start with no network showed "Can't reach the server" no matter what IndexedDB held. Sign-out clears that cache, so the next person on the device is not opened as the last one. The design doc is updated.
- **A new build is offered, never applied.** `registerType: 'prompt'` and a sticky toast with Update (`Toast` gained `sticky`, one line). Auto-update reloads the page, and doing that unasked while someone is halfway through a transaction would lose it.
- **The install hint is dismissed, not shown once and gone.** Section 7 says "shown once"; a glance is not reading, so it stays on Home until Got it / Not now or the app is installed. Chromium's `beforeinstallprompt` is captured at module load (it fires before React mounts) and offers Install; Safari on an iPhone gets the Share instruction; standalone and dismissed get nothing. MASTER has no rule for this component, so it is a Card with the existing text styles and buttons, checked in both themes at 393 and 360.
- **The mark is new.** `favicon.svg` was Vite's lightning bolt. It is now the Lucide `wallet` on `--color-primary`, and the three PNGs (192, 512, apple-touch 180) are rasterised from it with headless Edge, inside the maskable safe zone. Not a logo; a placeholder that is at least the app's own.
- **`reset-demo --empty`.** Onboarding needs a user with no data and the job could only rebuild the fixture. `ResetDemo.ClearAsync` is the delete half of `RunAsync`, exposed; tested in Application and against SQL.
- **The rate limit has a knob.** The global limiter allows 100 requests a minute per address, static files included, and one Playwright worker reloading the app spends that in seconds: two specs failed with a page whose body was a `429` problem document. `RATE_LIMIT_PERMIT` in compose (default unchanged) and `webServer.env` in the Playwright config. Worth revisiting in M9 with forwarded headers: a person on a phone loads about twenty requests per cold start.
- **Spec files are numbered.** One shared demo user means one worker, and the order is part of the contract: `03-transactions` adds rows `04-settings` sees, `07-onboarding` empties the demo and must be last. Playwright runs files alphabetically; the number puts the dependency on the file name.
- **Service-worker specs are Chromium.** `context.serviceWorkers()` is Chromium-only; everything else runs on the iPhone 15 profile (WebKit, 393px). The cold-start spec reloads once online after the worker is ready, because the visit that installs a worker is not served by it.
- **`support.ts` derives from the fixture** (`cycleCount`, `fixtureSpent`, `today()` in Sydney) rather than pinning numbers, and does the C# integer division by hand: `130 / 30 + 1` is 5.33 in JavaScript, which was the first thing to fail.
- **Red-first, honestly:** the six `src/pwa` tests were written before the code and failed on the missing modules; the first green run then hid a real hang (a faked clock leaking out of a timed-out test) that only showed as four timeouts, fixed by watching for the timer instead of running it down. The Playwright suite went 1/13 (no cookie: the setup file was outside `testDir`), 9/15, 16/22, 22/22, each step a specific wrong assumption: the fixture division, the progress bar naming itself with `aria-valuetext`, "22 Sep" not "Today", a strict-mode clash on "Past", a toast matched by a dialog's body, and the rate limit.

Not checked, and why: a real iPhone (Add to Home Screen, the splash, standalone insets) and Android's install banner. Playwright can emulate neither; the manifest and icons are asserted, the flows are not.

## Context

M6 shipped the offline store and the outbox; "offline" meant the network dropped while the tab was open, and a cold start with no signal showed an error. Nothing was installable. The sheets' focus trap, Escape and focus return, and everything jsdom cannot do, had no automated check.

Outcome: the app is installable from Chromium and Safari with its own icon, opens with no signal from the second visit on, offers a new build without forcing it, and every user story is proven end to end in a real browser against the real stack in about a minute, on demand.

## How to run it

```
cd tests/e2e
npm ci && npx playwright install webkit chromium   # once
npm test                                           # starts docker compose if :8080 is quiet; ~1 minute
npm run test:ui                                    # the tree and the time-travel debugger
```

The rest is `docs/playwright_setup.md`.
