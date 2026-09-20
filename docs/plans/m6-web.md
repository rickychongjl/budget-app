# M6 plan: Web (shell, sign-in, onboarding, offline store, add-transaction, categories and budgets)

Source: `docs/solution-design.md` section 7 and section 17 item 6, `docs/user-stories.md`, `design-system/budget/MASTER.md`. Picks up what M4 and M5 deferred here: SPA static files and `index.html` fallback, the Node stage in the Dockerfile, the login button, the `403` screen, the antiforgery fetch wrapper.
Code lands in a new `src/web`, plus a few lines in `src/Budget.Api` (static files, fallback, sign-in failure redirect), the Dockerfile and `ci.yml`. One new route, `GET /auth/options`; no new `/api` routes.

## Status: in progress (slice 1 of 14 done)

Where the code differs from the plan below:

- **Lint is `oxlint`, not ESLint.** It is what the current Vite `react-ts` template ships, with the React hooks rules on; `npm run lint` fails on warnings.
- **The image's entry point passes `--contentRoot /app/api`.** Found by running the container: the working directory is `/app` (so a job is `dotnet jobs/Budget.Jobs.dll <name>`), and the API looked for `wwwroot` in `/app` and answered `404` for `/`. It had been missing `appsettings.json` the same way since M4, which only cost the log levels.
- **`UseStaticFiles` sits ahead of the rate limiter**, so the files of one page load do not spend the API's allowance.
- **The shared API test host blanks `Entra:ClientId` and `Auth:AllowedOids`.** It runs as Development and so loads user-secrets; once the Entra setup was done on this machine, `Without_entra_settings_there_is_no_login_route` got a real challenge (`302`). CI never saw it.

## Context

The API is complete for everything except reports: every route in the M4 table answers, the demo has seeded data, Entra sign-in issues the cookie. Nothing renders it. `src/web` does not exist, `/` is a `404`, and the Dockerfile says "the Node stage joins in M6".

Outcome: on a phone-sized browser against `docker compose up`, a visitor taps "Try the demo", sees the current cycle, adds a transaction with the keypad in a few taps, edits categories and budgets, and everything they add while the network is off is still there and reaches the server when it comes back. A first-time real user is walked through onboarding to a confirmed cycle.

## Done when

- `docker compose up -d --build` serves the SPA at `http://localhost:8080/`; a deep link (`/cycles/<id>`) reloads to the same screen; an unknown `/api/*` path is still `404`/`401` problem details, never `index.html`.
- Signed out: a sign-in screen with "Sign in with Microsoft" (drawn only when `GET /auth/options` lists `entra`) and "Try the demo". A refused Entra sign-in lands on a "not allowed" screen, not raw JSON.
- A user with no cycle is taken through onboarding (stories Onboarding 1 to 5) and cannot reach Add until the cycle is confirmed.
- Home shows the cycle header and category rows per MASTER 9 and 3.3, from the API rollup.
- Add-transaction sheet per MASTER 9: keypad, Spending / Income, searchable picker with last-used first, date, optional note, Save, "Saved" toast with Undo.
- Transactions can be listed, edited and deleted for the current and past cycles; a past-cycle write shows the closing-balance dialog (flag from the API, never guessed).
- Categories and budgets of the current and future cycles can be added, edited, reordered and removed; a past cycle is read-only in the UI as well as `422` from the API.
- With the network off: cached data renders, transaction add/edit/delete and category edits apply at once and queue, the connectivity banner shows the count, category add/remove are disabled with a visible "needs a connection" reason. Back online the queue drains through `POST /api/sync` and the screen matches the server.
- Theme System / Light / Dark works with no flash on load.
- `npm run lint`, `npm run test` and `npm run build` are green and run in `ci.yml`; `dotnet build -warnaserror` and `dotnet test` stay green.
- MASTER section 14 checklist run on every screen (chart line excepted: no charts yet).

## Out of scope (and where it goes)

| Thing | Milestone |
|---|---|
| Trend line graph, its filter, "View as table", `GET /api/reports/cycles` | M7 |
| Service worker, precache, runtime caching, manifest, maskable icons, install hint | M8. Until then "offline" means the network dropped while the tab is open; a cold start offline needs the service worker |
| Playwright specs | M8 |
| CSP and its hash for the inline theme script, security headers | M9. The script is written now so the hash is one line later |
| Export, delete account | M10 |
| Generated API types (OpenAPI) | Not planned. Ten hand-written types; `ponytail:` note names the upgrade |
| Drag-to-dismiss on sheets, drag-to-reorder categories | Not in M6. Close button, scrim and Escape cover the sheet; up/down buttons cover reordering (MASTER requires the button alternative anyway). Add the drag when someone misses it |
| Desktop layout | Never (MASTER 6) |

## Stack (design section 7, nothing added)

React 19, Vite, TypeScript (strict), React Router, TanStack Query, Dexie + `dexie-react-hooks`, `lucide-react`, `@fontsource-variable/inter`. Tests: Vitest, React Testing Library, MSW, `fake-indexeddb`. Lint: ESLint with the Vite React-TS preset.

Styling is plain CSS: one `tokens.css` holding every MASTER token under `:root[data-theme]`, and a CSS Module per component. No Tailwind, no component library, no CSS-in-JS: the token file is the design system and components may only reference `var(--...)`. A ten-line Vitest that greps `src/**/*.css` outside `tokens.css` for `#[0-9a-f]{3,8}` and `rgb(` keeps raw colours out, without adding stylelint.

Recharts is not installed until M7 and `vite-plugin-pwa` not until M8.

## Layout of `src/web/src`

```
api/        client.ts (fetch wrapper, csrf, problem details), types.ts, queries.ts (TanStack hooks)
offline/    db.ts (Dexie schema), outbox.ts (enqueue, drain), overlay.ts (apply queue over server data)
format/     money.ts, dates.ts
theme/      theme.ts, tokens.css
ui/         Button, Card, Sheet, Dialog, Toast, SegmentedControl, Field, ProgressBar, IconChip, StatusBadge, Skeleton, EmptyState
shell/      AppShell, TopBar, TabBar, ConnectivityBanner
features/   auth/, onboarding/, home/, transactions/, categories/, cycles/, settings/
```

## How data moves (the one design that matters)

Two stores, each with one job:

- **Server snapshot.** TanStack Query owns reads (`me`, `cycles`, `cycles/current`, `cycles/{id}`, `transactions?cycleId`). Each successful response is also written to a Dexie `cache` table by query key, and is the query's `initialData` on the next load, so cached data renders first and skeletons appear only on a true first load.
- **Outbox.** A Dexie `outbox` table of `SyncItem`s in insertion order, exactly the shape `POST /api/sync` takes. Offline-capable writes (transaction create/edit/delete, category edit) never call their own endpoint: they append to the outbox, and `drain()` posts the batch.

What the screen shows is `overlay(snapshot, outbox)`: a pure function that applies the queued items to the cached summary and transaction list (adds the row, adjusts that category's `actual`, `remaining`, `percentUsed`, `status` and the cycle totals with the same arithmetic as `CycleRollup.Line`). It is the only place the front end does rollup maths, it exists only for rows the server has not seen, and it is the most-tested file in the project. Once `drain()` succeeds the items are removed and the queries are invalidated, so the server's numbers replace the overlay's.

`drain()` is event-driven, not polled. It runs after every enqueue when online, on the `online` event, on app load, and when the page becomes visible again (`visibilitychange`: a phone app reopened from the background neither reloads nor reliably fires `online`). One drain at a time; a trigger that arrives mid-drain is dropped and the running drain re-checks the queue before it finishes. A drain that fails on the network or a `5xx` arms a retry timer (5s, 15s, then every 60s) that exists only while the outbox is non-empty, so a flaky connection that never fires an event cannot strand the queue and an idle app never polls. Per-item results: `ok` removes the item; a refusal (`422`, `404`) removes it too and raises an error toast with the `detail` (keeping it would block the queue for ever); a network failure or `5xx` keeps everything. `401` keeps the queue intact and sends the user to sign-in (design section 7). A queued create carries the `cycleId` it was entered against, so a rollover while offline does not move it.

Writes that need a connection (onboarding, category add/remove, cycle start date, balances, confirm) are ordinary TanStack mutations against their endpoints, disabled while offline with the reason shown.

Online state is `navigator.onLine` plus the `online`/`offline` events, corrected by the last fetch outcome (a failed fetch marks offline until one succeeds). `ponytail:` no heartbeat ping; add one if the banner is ever wrong for long.

## Slices (TDD order, one commit each)

First commit is this plan. Each UI slice ends with MASTER section 14. Home comes before the offline store (agreed 2026-09-20) so there is something to look at early.

### 1. Scaffold, host wiring, CI
- `npm create vite` (react-ts) into `src/web`; strict TS; ESLint; Vitest + RTL + MSW + `fake-indexeddb` wired with one passing test. Vite dev proxy for `/api` and `/auth` to `http://localhost:8080`. `.nvmrc` = 22.
- `Budget.Api`: `UseDefaultFiles` + `UseStaticFiles` (or `MapStaticAssets`), and `MapFallbackToFile("index.html")` **after** the `/api` group so its own `MapFallback` keeps winning for `/api/*`. `/auth/*` and `/health*` unmatched paths must not return the page either. `index.html` is served `no-cache`; hashed assets `immutable`.
- API tests first (`SpaHostTests`, with a stub `wwwroot/index.html` in the test content root): `/` and `/cycles/abc` return the page; `/api/nope` is `401` anonymous and `404` signed in; `/auth/nope` is `404`; `/health` unchanged.
- Dockerfile: `node:22-alpine` stage runs `npm ci && npm run build`, output copied to `api/wwwroot`. `.dockerignore` already drops `node_modules`.
- `ci.yml`: new `web` job, Node 22 with npm cache, `npm ci`, `npm run lint`, `npm run test`, `npm run build`. CodeQL gains `javascript-typescript`.

### 2. Tokens, theme, base UI kit
- `tokens.css`: every MASTER token (3.1 to 3.4, 4, 5, 7, 8), both themes; `.num`; focus ring; reduced-motion block. Inter via `@fontsource-variable/inter`.
- Inline script in `index.html` sets `data-theme` and `theme-color` before paint from `localStorage["budget.theme"]`. `theme.ts`: get/set, live `prefers-color-scheme` listener under System, `color-scheme`.
- `ui/` primitives listed above, each a real `<button>`/`<input>`, 44px minimum, states per MASTER 9. `Sheet` and `Dialog` are built on the native `<dialog>` element (`showModal()` gives focus trap, Escape, scrim via `::backdrop`, focus return) rather than a hand-rolled trap.
- Tests: theme resolution (system/light/dark, storage unavailable); the no-raw-colour test; `Sheet` closes on Escape, Close and scrim and returns focus; `Button` pending state keeps width and is disabled.

### 3. Formatters
- `money.ts`: `Intl.NumberFormat("en-AU", { style: "currency", currency })`, true minus sign, optional leading `+`. `dates.ts`: "1 Sep", "1 Sep 2025" outside the current year, "1 Sep to 30 Sep", "day 12 of 30". Dates are `YYYY-MM-DD` strings end to end, never `new Date(string)` (time zone drift); "today" is computed in the user's `TimeZone` from `/api/me`.
- Tests are the spec: table-driven, including negatives, year boundary, and a time zone where local today differs from UTC today.

### 4. API client and session
- `client.ts`: same-origin `fetch`, JSON in and out, `credentials: "same-origin"`. Holds the antiforgery token in memory; fetches `/auth/csrf` lazily before the first non-GET, again after sign-in and sign-out; on `400 csrf.invalid` refetches and retries once. Non-2xx becomes a typed `ProblemError { status, code, detail, errors }`.
- `types.ts`: hand-written from the Application records (enums are strings; decimals arrive as JSON numbers).
- Session gate: `GET /api/me`; `401` means signed out. Sign-in screen: the official Microsoft button (MASTER 8), a plain `<a href="/auth/login">` drawn only when Entra is configured, and "Try the demo" (`POST /auth/demo`, then refetch `me`). Sign out in Settings clears the query cache, the Dexie `cache` table and the token; **the outbox is kept only if it belongs to the same user id**, otherwise cleared, so one visitor's queue can never replay into another's session.
- `Budget.Api`: `OnRemoteFailure` redirects to `/signin?error=<code>` instead of writing `403` JSON into a top-level navigation. The "not allowed" screen reads the code. M5's tests that assert the `403` body change to assert the redirect and the absence of a session cookie. Flagged as decision 5.
- Whether Entra is configured comes from a new `GET /auth/options`, answering `{ "signIn": ["demo", "entra"] }` (or `["demo"]`) from the existing `EntraSignIn.IsConfigured`. Anonymous, under the global rate limit only (like `/auth/csrf`, because every app load calls it; the strict `/auth` policy would lock out a reloading user), and a GET, so not antiforgery-checked. Probing `/auth/login` instead would start a real challenge. API test first: both shapes, and that it is reachable signed out. Decision 6.
- Tests (MSW): token attached to writes and not to GETs; one retry on `csrf.invalid` and only one; problem details parsed; `401` flips the gate; sign-out clears caches; outbox kept or cleared by user id.

### 5. App shell
- Routes: `/` Home, `/cycles`, `/cycles/:id`, `/settings`, `/settings/categories`, `/onboarding`, `/signin`. Add is not a route: the tab opens the sheet over the current screen.
- `AppShell`: top bar, scroll container (`100dvh`, safe areas, `scroll-padding`, `overscroll-behavior-y: contain`), tab bar with `aria-current`, 480px column from 600px up. `ConnectivityBanner` (offline / N waiting). One `Toast` host, `aria-live="polite"`.
- Tests: active tab announced; Add opens the sheet without a route change; banner text for offline and for a non-empty outbox.

### 6. Home (first real look)
- `useCurrentCycle()` is the one hook Home reads. In this slice it is the TanStack query alone, straight from `GET /api/cycles/current`; slice 7 puts the Dexie cache and the overlay behind the same hook, so Home does not change. Cycle header, "Spending" and "Income" sections of category rows with `ProgressBar` (`scaleX`, `role="progressbar"`, `aria-valuetext`), status per 3.3 (80% warning threshold is presentation and lives here; Over/Ahead come from `status`). Skeletons of final size. Empty state routes to onboarding.
- Tests: each row of table 3.3 renders its fill token, icon and word; long names truncate, amounts do not. After this slice: `docker compose up -d --build`, `npm run dev`, "Try the demo", and the seeded Home is on screen in both themes.

### 7. Offline store and overlay
- `db.ts`: Dexie `cache` (key, json, userId) and `outbox` (++seq, userId, item). `outbox.ts`: `enqueue`, `drain` as described above. `overlay.ts`: pure.
- Tests first, against `fake-indexeddb` and MSW: overlay of create/edit/delete on a summary (debit crosses 100% becomes `Over`, credit becomes `Ahead`, zero budget gives null percent, a delete of a queued create cancels both); edit-then-delete of the same `clientId`; category edit overlay; drain removes `ok` and refused items, keeps all on network failure, keeps all on `401`; two concurrent drains post once; a failed drain retries on the timer and the timer stops when the outbox empties (fake timers); becoming visible triggers a drain; replaying the same batch is harmless.
- Wire-in: `useCurrentCycle()` gains the cache (`initialData`) and the overlay; the connectivity banner reads the outbox count. Test: cached data renders before the network answers.

### 8. Add-transaction sheet
- Keypad amount entry (pure reducer: digits, one decimal point, two places, backspace, max 18,2), Spending / Income control, picker (search, last-used first from `localStorage`, filtered by type), `type="date"` defaulting to the user's today, "Add note" with `aria-expanded`, sticky Save. Save = `enqueue(transaction.create)` with `crypto.randomUUID()`, haptic, close, toast with Undo (Undo enqueues the delete; overlay cancels the pair if not yet sent).
- Disabled with a reason when the cycle is `Draft`.
- Tests: reducer table; Save disabled until amount and category; a save offline appears on Home at once and in the banner count; Undo removes it; demo cap refusal from sync surfaces as an error toast.

### 9. Transactions list, edit, delete, past-cycle prompt
- Tapping a category row opens its transactions for that cycle; tapping one opens the same sheet in edit mode with Delete (confirm dialog, haptic). Goes through the outbox.
- When a sync result (or direct response) has `requiresClosingBalanceReview`, show the MASTER dialog; "Update balance" opens the closing-balance field for that cycle (`PATCH /api/cycles/{id}`, online only).
- Tests: edit and delete overlay; the dialog appears only when the flag is set; "Not now" does nothing.

### 10. Cycles list and cycle detail (no chart)
- `/cycles`: cycle list rows per MASTER 9 (dates, badge Current/Past/Upcoming/Draft, spent against budgeted, accrued with sign and status colour). `/cycles/:id`: the Home body for that cycle, plus closing balance (editable when Past or Current-and-ended), opening balance (read-only when Past). M7 adds the chart above the list.
- Tests: badges by phase and status; accrued sign and colour plus sign character; past cycle shows no category or budget edit controls.

### 11. Categories and budgets
- `/settings/categories` with a cycle picker limited to current and future cycles. Edit name, icon (a fixed list of about 40 Lucide names, imported by name so the bundle holds only those), colour (the eight slots; a new category takes the next unused), budget (`inputmode="decimal"`), order (up/down buttons). Edits go through the outbox (`category.edit`); add and remove are direct and disabled offline with the reason. Remove is refused by the API when the category has transactions: show its `detail`.
- Tests: edit applies at once and queues; add/remove disabled offline with visible text; the `422` detail is shown by the field; next unused slot.

### 12. Onboarding
- Steps on one route: categories (reuses slice 11's editor against the Draft cycle), start date (`type="date"`, "ends 30 Sep" shown and not editable), opening balance, review, Confirm. `POST /api/cycles` creates the Draft on entering the date step; everything after is edits to it, so leaving and returning resumes. Error summary at the top when more than one field fails (MASTER 9).
- Tests: a user with no cycle is redirected here; Confirm disabled until categories, date and balance exist; resume from a Draft; Add tab disabled until Confirmed.

### 13. Settings
- Theme segmented control (`radiogroup`); display name and time zone (`PATCH /api/me`, read-only for the demo with the API's reason); current cycle start date with the MASTER confirm dialog ("This also moves every upcoming cycle...") and the API's `422` detail for an overlap; sign out.
- Tests: the dialog precedes the PATCH; cancel sends nothing; demo profile fields are disabled.

### 14. Docs and verification
- Plan status; CLAUDE.md (web commands, the `overlay` rule, `/signin?error=`); design doc deltas (decisions below); `docker compose up -d --build` walked through on a phone-sized viewport in both themes, network toggled off and on in devtools.

## Decisions taken

1. **Save is written once, the queued way, in M6** (agreed 2026-09-20). Save appends to the outbox and `drain()` posts the outbox to `/api/sync`; both are ordinary page code and both land in M6. Section 17 lists "offline store" under M6 and "offline sync" under M8; read literally that means either building Save as a direct `POST` now and rebuilding it on a queue later, or shipping a queue that nothing sends. M8 keeps the service worker, manifest and install hint. **The service worker only caches** (app shell, `GET /api/cycles/*`, `/api/categories`) so the app can open with no signal; it never syncs. Background Sync is not used: iOS Safari does not support it.
2. **The screen is `overlay(server snapshot, outbox)`, not a second local database of entities** (agreed 2026-09-20). No Dexie copy of cycles, categories and transactions to keep in step with the server, no merge logic: the server's response is cached whole, and the queue is laid over it until it drains. Cost: one pure function repeats `CycleRollup.Line`'s arithmetic for unsynced rows. MASTER 3.3 says the front end does not recompute status; this is the one exception and it is temporary by construction.
3. **Plain CSS with tokens and CSS Modules** (agreed 2026-09-20). No Tailwind or component library. MASTER is token-first and bans palette classes; a utility framework would need configuring down to the same tokens for no gain.
4. **Native `<dialog>` for sheets and dialogs** (agreed 2026-09-20). Focus trap, Escape, focus return and the scrim come from the platform. Drag-to-dismiss is left out (see out of scope).
5. **A failed Entra sign-in redirects to `/signin?error=<code>`** (agreed 2026-09-20) instead of answering `403` problem details. The callback is a top-level browser navigation, so JSON there is a dead end for a person. The status code is lost; the code, the log line and "no cookie" are kept. This changes M5 behaviour and its tests.
6. **`GET /auth/options` says which sign-ins exist** (agreed 2026-09-20; first draft put the field on `/auth/csrf`, rejected so that endpoint keeps one job). The SPA needs to know whether to draw the Microsoft button, and probing `/auth/login` would start a real challenge. Cost: one more route and one more request per load.
7. **Cycles list and detail are in M6, the chart in M7** (agreed 2026-09-20). Past-cycle transactions and closing balances (stories Transactions 4, Settings 11 and 13) need a screen to live on, and the detail page is Home's body with another id.
8. **Types are hand-written** (agreed 2026-09-20). About ten records. `ponytail:` generate from OpenAPI if the API grows or drifts.
9. **A refused sync item is dropped with an error toast** (agreed 2026-09-20), not kept for retry. A `422` will be `422` for ever and would block everything queued behind it.

## Verification

- `npm run lint && npm run test && npm run build` in `src/web`; `dotnet build -warnaserror`; `dotnet test`.
- `docker compose up -d --build`, then by hand at 390px wide, light and dark: demo sign-in, add a spend and an income, push a category over budget (red, icon, "Over by"), edit and delete, add to a past cycle (dialog), edit a budget, devtools offline: add two, see "2 changes waiting", back online: banner clears and a reload shows them from the server.
- MASTER section 14 per screen.
