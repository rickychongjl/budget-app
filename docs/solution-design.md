# Budget PWA — Solution Design

| | |
|---|---|
| **Status** | Draft v2 — 19 Sep 2026 (cycle model revised against `docs/user-stories.md`) |
| **Owner** | Ricky Chong |
| **Purpose** | Personal monthly budget tracker, built to production standard as an interview portfolio piece |
| **Stack** | .NET 10 · ASP.NET Core · EF Core · SQL Server (Azure SQL) · React 19 + Vite + TypeScript · Azure Container Apps · GitHub Actions · Bicep |

> Working name is **Budget**. Rename project namespaces (`Budget.*`) once a product name is chosen.

---

## 1. Goals and non-goals

### Goals

1. Track a budget on a phone in fixed 30-day cycles: debit and credit categories, a budget amount per category per cycle, transactions against them, opening and closing balances, and a movable cycle start date.
2. Show the current cycle's status per category (over or under budget), a list of all cycles, and a line graph of total spending, per-category spending and money accrued across cycles.
3. Installable PWA that opens instantly and works offline, with background sync when connectivity returns.
4. Single real user (Ricky) with strong authentication; a public, self-resetting demo account for interviewers.
5. Production-grade engineering: TDD, full test pyramid, CI/CD, infrastructure as code, observability, security hardening — and a repository that reads well to a senior engineer.
6. Running cost under roughly A$20/month.

### Non-goals (v1)

- Public sign-up, billing, subscriptions, marketing site, app-store submission.
- Bank feeds, receipt scanning, shared/household budgets.
- Multi-region, high availability, SLA.

Everything in the non-goals list is *designed for* (multi-user data model, stateless API, tenant isolation) but *not built*.

---

## 2. Architecture overview

### 2.1 Shape: monolith

A single ASP.NET Core application serves both the API (`/api/*`) and the React SPA (static files from `wwwroot`, with a fallback to `index.html` for client-side routes). One deployable, one domain, one container image.

**Why monolith**

- One deployable and one pipeline; the fewest moving parts to operate for a one-person project.
- Same-origin: cookie-based authentication works without CORS and without the iOS third-party-cookie problem that a split front end on a different domain would hit.
- Nothing about the code prevents a later split — the React project is its own folder and only knows the API's HTTP contract.

**When to decouple** (not now)

- Traffic justifies serving static assets from a CDN edge to take load off the API.
- A native mobile app needs to share the API with the web app.
- Front end and back end need independent release cadences (separate teams).

Cloudflare (free plan) sits in front regardless and caches `/assets/*`, which gives most of the CDN benefit without the split.

### 2.2 Runtime topology

```
Phone (PWA)
   │  HTTPS
   ▼
Cloudflare (DNS, WAF, DDoS, caches /assets/*, hides origin)
   │
   ▼
Azure Container Apps — Consumption plan, Australia East
   ├── budget-api  (Container App, min replicas 1, max 3)
   │      ASP.NET Core: React SPA + /api + Entra BFF auth
   ├── budget-migrate  (Container Apps Job, manual trigger from pipeline)
   ├── budget-rollover  (Container Apps Job, cron hourly at :05, idempotent)
   └── budget-demo-reset  (Container Apps Job, cron 17:00 UTC = 03:00 AEST)
   │
   ├──▶ Azure SQL Database — Basic tier (5 DTU, 2 GB), provisioned
   ├──▶ Storage Account (LRS) — Data Protection key ring blob
   ├──▶ Application Insights → Log Analytics workspace (shared with ACA console logs)
   └──▶ Microsoft Entra ID — single-tenant app registration (OIDC)

GitHub → GitHub Actions → GitHub Container Registry → (OIDC) → Azure
```

### 2.3 Layered code architecture

Dependency direction is strictly inward. Domain has zero dependencies.

| Project | Responsibility | References |
|---|---|---|
| `Budget.Domain` | Entities, value objects, domain rules (cycle date maths, budget rollups, money) | — |
| `Budget.Application` | Use cases (commands/queries), DTOs, **repository interfaces**, validation | Domain |
| `Budget.Infrastructure` | EF Core `DbContext`, repository implementations, migrations, global query filters | Application |
| `Budget.Api` | ASP.NET Core host: endpoints, auth, rate limiting, Data Protection, `wwwroot`, Dockerfile | Application, Infrastructure |
| `Budget.Jobs` | Console host with three entry points: `migrate`, `rollover`, `reset-demo`. Thin: each calls an Application use case | Infrastructure |
| `web` | React + Vite + TypeScript PWA | (HTTP only) |

**Repository pattern — scope.** One narrow interface per aggregate (`ICycleRepository`, `ICategoryRepository`, `ITransactionRepository`, `IUserRepository`) declared in Application, implemented with EF Core in Infrastructure. Methods are intent-revealing (`GetForCycleAsync(userId, cycle)`), never expose `IQueryable`, and there is no generic `IRepository<T>`. A unit-of-work abstraction (`IUnitOfWork.SaveChangesAsync`) wraps `DbContext.SaveChangesAsync`. This keeps use-case tests free of EF and lets them run against in-memory fakes.

---

## 3. Domain model

### 3.1 Entities

```
User
  Id (Guid)               -- internal key
  ExternalId (string)     -- Entra `oid`; null for demo user
  DisplayName
  IsDemo (bool)
  TimeZone (string, IANA, "Australia/Sydney")  -- decides what "today" is for cycle rollover
  Currency (string, "AUD")
  CreatedAt

Cycle                     -- a stored 30-day budget period
  Id, UserId (FK), StartDate (date), EndDate (date, always StartDate + 29),
  Status (Draft | Confirmed),
  OpeningBalance (decimal 18,2, null until entered),
  ClosingBalance (decimal 18,2, null until entered)

Category                  -- stable identity across cycles (used for trend reports)
  Id, UserId (FK), Type (Debit | Credit, immutable), CreatedAt

CycleCategory             -- the per-cycle snapshot: what the category looked like in that cycle
  Id, UserId, CycleId, CategoryId, Name, Icon, Colour, SortOrder,
  BudgetAmount (decimal 18,2)   -- spend limit for Debit, expected amount for Credit

Transaction
  Id, UserId, CycleId, CategoryId, Amount (decimal 18,2), OccurredOn (date),
  Note, CreatedAt, UpdatedAt, ClientId (Guid, idempotency key for offline sync)
```

### 3.2 Domain rules (live in `Budget.Domain`, unit-tested first)

- **Cycle length.** Fixed at 30 days inclusive: `EndDate = StartDate + 29`, and the next cycle starts on `StartDate + 30`. End dates are never set by the user.
- **Past, current, future.** "Today" is resolved in the user's `TimeZone`. The *current* cycle is the earliest cycle whose `EndDate >= today`; cycles before it are *past*, cycles after it are *future*.
- **Moving the start date.** Only the current cycle's `StartDate` can be changed (this holds even when past cycles exist). The new start must be after the previous cycle's `EndDate`: no overlaps, gaps are allowed. All existing future cycles are re-dated to keep the 30-day chain. Past cycles never move. The UI warns that future cycles will shift before saving.
- **Transactions belong to a cycle by `CycleId`, not by date.** Set at creation (UI defaults to the current cycle) and never recomputed. Moving a start date does not re-bucket transactions, so a transaction's `OccurredOn` may fall outside its cycle's range; that is an accepted consequence of the user's own change.
- **Rollover.** Automatic, with no user action. When `today > EndDate` of the user's latest `Confirmed` cycle, the next cycle is created (repeatedly, until one covers today) as `Confirmed`, with the previous cycle's `CycleCategory` rows copied (name, icon, colour, order, budget). The next cycle's `OpeningBalance` follows the previous cycle's `ClosingBalance` once that is entered. A user whose only cycle is still `Draft` is skipped.
  - The rule is pure domain logic (`Cycle.CreateNext`, given today); one Application use case, `RolloverCycles`, applies it for a user. It is idempotent: running it when nothing is due does nothing.
  - **Primary trigger:** the `budget-rollover` Container Apps Job, hourly. It lists users, and for each one runs `RolloverCycles` with "today" in that user's `TimeZone`. Hourly plus idempotent means no daylight-saving logic: the run after the user's local midnight does the work, the other 23 are no-ops.
  - **Fallback trigger:** `GET /api/cycles/current` runs the same use case before answering, so a failed or late job never leaves the app without a current cycle. It also makes local dev and Playwright work without a scheduler.
  - The unique index on `Cycle (UserId, StartDate)` makes the two triggers racing each other harmless: the loser's insert fails, it re-reads and carries on.
- **Snapshot.** Category name, icon, colour, order and budget live on `CycleCategory`, so editing them affects only that cycle and whatever is later copied from it. A category added mid-cycle creates a `Category` plus a `CycleCategory` for that cycle. A `CycleCategory` can be removed only if it has no transactions in that cycle.
- **Editability.**

  | | Past cycle | Current cycle | Future cycle |
  |---|---|---|---|
  | Categories and budgets | read-only | editable | editable |
  | Start date | read-only | editable | follows the current cycle |
  | Opening balance | read-only | editable | follows previous closing |
  | Closing balance | editable | editable | n/a |
  | Transactions | editable, with a prompt | editable | n/a |

  Adding, editing or deleting a transaction in a past cycle is allowed (single-user convenience); the API flags the response and the UI prompts the user to update that cycle's closing balance. Violations of the read-only cells return `422`.
- **Onboarding.** The first cycle is created as `Draft` (start date, opening balance, categories, budgets) and becomes `Confirmed` when the user confirms the budget. Transactions require a `Confirmed` cycle.
- **Rollup.** For a cycle: per category → `budgeted`, `actual`, `remaining`, `percentUsed`, and a status: a Debit category is *over* when `actual > budgeted` (red); a Credit category is *ahead* when `actual > budgeted` (green). Totals: budgeted and actual for debits and for credits, `net = credits − debits`, and `accrued = ClosingBalance − OpeningBalance` when both are entered.
- **Money.** Amounts are `decimal(18,2)` and positive; direction comes from the category's `Type`. A negative amount is a reversal (a refund in a Debit category).

### 3.3 Tenant isolation

Every table except `User` carries `UserId`. `BudgetDbContext` applies an EF Core **global query filter** `e => e.UserId == _currentUser.Id` to all tenant entities, and `SaveChanges` stamps `UserId` on inserts and rejects updates whose `UserId` differs from the current user. Integration tests assert that user A cannot read, update, or delete user B's rows through any endpoint.

Jobs that work across users (`rollover`) do not switch the filter off. They read the `User` table (which is unfiltered), then open a DI scope per user with `ICurrentUser` set to that user, so each user's work goes through the same filter and stamping as a web request. Only `reset-demo` and the seed use `IgnoreQueryFilters`.

---

## 4. API surface

All endpoints under `/api`, JSON, cookie-authenticated, versioned via URL prefix only if ever needed. Minimal APIs grouped by feature.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/me` | Current user profile, cycle settings, `isDemo` |
| `PATCH` | `/api/me` | Update `DisplayName`, `TimeZone` |
| `GET` | `/api/cycles` | List all cycles (dates, status, past/current/future, balances) |
| `POST` | `/api/cycles` | Onboarding only: create the first cycle as `Draft` (start date, opening balance) |
| `POST` | `/api/cycles/{id}/confirm` | Confirm the draft budget |
| `GET` | `/api/cycles/current` | Current cycle summary; runs the rollover fallback first if the job has not caught up |
| `GET` | `/api/cycles/{id}` | Cycle summary: per-category rollup + totals |
| `PATCH` | `/api/cycles/{id}` | `startDate` (current only, shifts future cycles), `openingBalance`, `closingBalance` |
| `POST` | `/api/cycles/{id}/categories` | Add a category to a current/future cycle (creates the `Category` if new) |
| `PATCH` | `/api/cycles/{id}/categories/{categoryId}` | Rename, recolour, reorder, change budget, for that cycle only |
| `DELETE` | `/api/cycles/{id}/categories/{categoryId}` | Remove from the cycle (only if it has no transactions there) |
| `GET` | `/api/categories` | Category identities with latest name and type (report filters) |
| `GET` | `/api/transactions?cycleId=&categoryId=` | List for cycle, optional category filter |
| `POST` | `/api/transactions` | Create in `cycleId` (idempotent on `ClientId`); response flags a past-cycle write |
| `PATCH` | `/api/transactions/{id}` | Edit |
| `DELETE` | `/api/transactions/{id}` | Delete |
| `POST` | `/api/sync` | Batch of offline mutations, applied in order, returns per-item result |
| `GET` | `/api/reports/cycles` | Every cycle with its rollup, oldest first: the same `CycleSummaryDto` as `/api/cycles/{id}`, once per cycle, so the chart and the cycle list cannot disagree. Four queries however many cycles there are, because the per-category sums come from a `GROUP BY`. The client filters the line graph |
| `GET` | `/auth/login` | Redirect to Entra (OIDC). `404` when Entra is not configured (local compose, tests) |
| `POST` | `/auth/callback` | OIDC redirect URI (`form_post`), answered by the OpenID Connect middleware. A refused sign-in redirects to `/signin?error=<code>` (`auth.not-allowed`, `auth.failed`) with no session, because the callback is a top-level navigation and problem details would strand a person on raw JSON |
| `GET` | `/auth/options` | `{ "signIn": ["demo", "entra"] }`: which sign-ins this deployment offers, so the SPA draws the Microsoft button only when it leads somewhere. Anonymous, global rate limit only |
| `GET` | `/auth/csrf` | Issue the antiforgery token pair for the current caller; the request token is returned in the JSON body (`{ "token": ... }`) for the page to hold in memory; the cookie token stays `HttpOnly` |
| `POST` | `/auth/logout` | Clear session |
| `POST` | `/auth/demo` | Issue a demo session (rate-limited) |
| `GET` | `/health` | Liveness (no DB touch) |

Errors use RFC 9457 `application/problem+json`. Validation via FluentValidation in the Application layer.

---

## 5. Authentication and authorisation

### 5.1 Real user — Entra ID, single tenant

- A dedicated free **Entra ID tenant** owned by Ricky (not the employer's). One user in it.
- App registration: **single-tenant**, web platform, redirect URI `https://<domain>/auth/callback`, ID tokens only (no API scopes needed — the app is its own resource).
- Security Defaults enabled (free MFA). Passkey registered in Microsoft Authenticator.
- **Defence in depth:** the API additionally checks the ID token's `oid` claim against a configured allowlist. Tenant misconfiguration alone cannot admit anyone.
- No registration endpoint exists. Users are created by the migration/seed, never by the app.

### 5.2 BFF cookie pattern

The server, not the browser, performs OpenID Connect:

1. `/auth/login` redirects to Entra with authorization-code flow + PKCE (ASP.NET Core's OpenID Connect handler against the tenant's own authority; `Microsoft.Identity.Web` was dropped in M5 because its issuer validation cannot run without the network, see `docs/plans/m5-auth.md`).
2. Entra redirects to `/auth/callback` with a one-time code.
3. The API exchanges the code for tokens server-to-server, validates the ID token, maps `oid` → `User.Id`.
4. The API issues an ASP.NET cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, sliding expiry 30 days, encrypted/signed with Data Protection.
5. React never sees a token; `fetch('/api/...')` sends the cookie automatically.
6. Whether anyone is signed in is simply whether `GET /api/me` answers: the cookie is `HttpOnly`, so the page cannot look at it. A `401` from any request drops the SPA back to its sign-in screen.

Session ticket is self-contained in the cookie (no server-side session store) in v1. If "sign out everywhere" is later needed, add a `SessionStore` backed by a table.

### 5.3 Demo user

- An ordinary `User` row with `IsDemo = true`, `ExternalId = null`. Goes through every code path the real user does, including tenant isolation.
- `POST /auth/demo` issues the same cookie type with the demo user's ID and a **4-hour** absolute expiry. Rate-limited per IP (e.g. 5/min, 20/day).
- **Abuse caps** enforced in the Application layer for demo users: max 20 categories, max 500 transactions, notes ≤ 200 chars. Requests beyond the cap return `429`/`422`.
- **Nightly reset** by the `budget-demo-reset` Job: delete all rows for the demo user, re-insert the fixture (`tests/e2e/fixtures/demo-seed.json` — shared with Playwright; dates are stored as offsets from today so the demo always has a current cycle and some history), and log the run. A manual trigger exists for pre-interview resets.
- Known limitation: the demo user is shared; concurrent visitors see each other's entries.

### 5.4 Data Protection

Key ring persisted to Azure Blob Storage (`PersistKeysToAzureBlobStorage`) so cookies survive deployments and are valid across replicas. Optionally `ProtectKeysWithAzureKeyVault` later. Container App uses a **system-assigned managed identity** with `Storage Blob Data Contributor` on the container; no connection string.

---

## 6. Security hardening

| Layer | Control |
|---|---|
| Edge | Cloudflare proxied DNS: WAF managed rules, bot fight mode, DDoS, origin IP hidden. ACA ingress restricted to Cloudflare IP ranges. |
| Transport | HTTPS only, HSTS (preload after first month), TLS 1.2+. TLS ends at the ingress, so the app must honour `X-Forwarded-Proto` (M9): outside Development antiforgery refuses requests it sees as plain http, and every write would fail. |
| Headers | CSP (self + inline hashes for Vite), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`. |
| Auth | Single-tenant Entra + `oid` allowlist, MFA, passkey, BFF cookie, anti-forgery on state-changing requests (ASP.NET Core antiforgery: token from `GET /auth/csrf`, sent back as `X-XSRF-TOKEN` on every non-GET; bound to the signed-in user, so it is fetched again after sign-in and sign-out). |
| Rate limiting | ASP.NET `RateLimiter`: global per-IP sliding window; stricter on `/auth/*`. |
| Data | Tenant filter on every query; parameterised queries via EF; `decimal` money; no PII in logs. |
| Database | Not publicly reachable; firewall = "Allow Azure services" only; TDE at rest (default); 7-day PITR (Basic). |
| Secrets | None in repo. Connection string and Entra client secret as ACA secrets; pipeline auth via OIDC federated credential (no stored Azure credentials in GitHub). |
| Supply chain | Dependabot for NuGet, npm, Actions; CodeQL on PRs. |
| Privacy | Export (`GET /api/me/export`) and delete-account endpoints exist even for one user; no third-party analytics. |

---

## 7. Front end (PWA)

- **Design system:** `design-system/budget/MASTER.md` is the source of truth for colour tokens (light and dark, user-toggleable: System / Light / Dark), typography, spacing, motion, components and chart styling. Per-screen overrides go in `design-system/budget/pages/`. This section describes behaviour; MASTER describes presentation.
- **Stack:** React 19, Vite, TypeScript, React Router, TanStack Query, Dexie (IndexedDB), Recharts, `vite-plugin-pwa` (Workbox), Lucide icons, self-hosted Inter.
- **Offline-first:** current cycle data is cached in IndexedDB and rendered immediately. Mutations are applied optimistically to the local store, queued, and pushed via `POST /api/sync` when online. Each mutation carries a `ClientId` so replays are idempotent, and each queued transaction carries the `CycleId` it was entered against, so a rollover that happens while offline does not move it.
- **How it is built (M6, `docs/plans/m6-web.md`):** two stores, each with one job. TanStack Query owns reads, and each good answer is also kept whole in a Dexie `cache` table, so the last one renders before the network replies and when it never does. A Dexie `outbox` table holds the queued changes in exactly the shape `POST /api/sync` takes. What the screen shows is `overlay(server snapshot, outbox)`: a pure function that lays the queue over the cached answer, repeating `CycleRollup.Line`'s arithmetic only for rows the server has not counted. There is no second local copy of cycles, categories and transactions to keep in step. `drain()` is event-driven (after each enqueue, on `online`, on load, when the page becomes visible), with a retry timer that exists only while something is waiting. A change the server accepts stays in the overlay until a snapshot newer than the sync arrives, so a saved transaction never flickers out and is never counted twice. A change the server refuses (a demo cap, a category removed elsewhere) is dropped with an error toast, because it would be refused again and would block the queue behind it. The queue belongs to a user: signing in as someone else discards it.
- **Online only, and said so on screen:** onboarding, adding or removing a category, the cycle start date, balances and the profile. Each needs the server to decide something a queued change could not show (the next cycle's opening balance, the re-dated upcoming cycles, an id for a new category).
- **What works offline:** adding, editing and deleting transactions, and editing a category's name, icon, colour, order or budget. These are queued and replay safely (a transaction by `ClientId`; a category edit is last-write-wins). **Adding or removing a category needs a connection:** a new category has no server id for queued transactions to point at, and "remove only if it has no transactions" cannot be checked against a queue the server has not seen. While offline the UI must say so plainly: the add and remove controls are disabled with a visible "needs a connection" reason, not hidden and not left to fail on tap.
- **Service worker:** precaches the app shell; runtime-caches `/api/cycles/*` and `/api/categories` with stale-while-revalidate; never caches `/auth/*`.
- **Auth expiry offline:** a `401` on sync keeps the queue intact and prompts sign-in; nothing is lost.
- **Mobile UX:** bottom tab bar (Home · Add · Cycles · Settings), a one-tap "Add transaction" sheet with numeric keypad and a searchable category picker (last-used first, debit and credit), safe-area insets, 44px targets, haptics where supported, respects reduced-motion.
- **Charts:** Home shows each category's actual against its budget (debit over budget in red, credit ahead of target in green). A cycle's detail page shows the same for that cycle. The Cycles page shows a line graph across cycles above the list of cycles (the chart is first: the list grows for ever and would push it off the screen), filterable by total spending, a single category, or money accrued. The cycle being lived in is plotted, drawn hollow and labelled "so far", and left out of the summary sentence, because three days of spending against a finished cycle would read as a crash. A cycle with no value for the chosen filter is a gap, never a zero. The y axis fits the data rather than starting at zero, which would squash a household's spending into a flat line; money accrued keeps its zero baseline (M7, `docs/plans/m7-reports.md`). Home and cycle detail use progress rows, not a chart library; there are no pie charts. `CycleCategory.Colour` stores a palette slot name (e.g. `"blue"`) and `Icon` a Lucide icon name, never hex, so one stored value renders correctly in both themes.
- **Install:** manifest with maskable icons, `display: standalone`, theme colour; iOS "Add to Home Screen" hint shown once.

---

## 8. Data persistence

- **Azure SQL Database, Basic tier** (5 DTU, 2 GB), provisioned — always on, no wake-up latency, no vCore-second accounting. ~US$5/month.
- EF Core code-first; migrations checked in under `Budget.Infrastructure/Migrations`.
- Migrations must be **backward-compatible** with the previous app version (expand → migrate → contract), because the migration job runs before the new revision goes live.
- Indexes: `Cycle (UserId, StartDate)` unique, `CycleCategory (UserId, CycleId, CategoryId)` unique, `Transaction (UserId, CycleId, CategoryId)`, `Transaction (UserId, OccurredOn)`, `Transaction (UserId, ClientId)` unique.
- Local dev and tests use SQL Server 2022 Express in Docker; parity with Azure SQL is sufficient for this schema.

---

## 9. Testing strategy (TDD)

| Tier | Project | Tooling | Runs where |
|---|---|---|---|
| Domain unit | `Budget.Domain.Tests` | xUnit, FluentAssertions | Every commit; milliseconds. Cycle maths, rollups, carry-forward — **write these first.** |
| Application unit | `Budget.Application.Tests` | xUnit, NSubstitute, in-memory fake repositories, `FakeTimeProvider` | Every commit. Use cases, validation, demo caps, `RolloverCycles` (idempotent, catches up several missed cycles, skips Draft, respects the user's time zone). |
| Infrastructure integration | `Budget.Infrastructure.Tests` | xUnit + **Testcontainers** (`mcr.microsoft.com/mssql/server:2022-latest`) | Every commit (Docker on runner). Repositories, query filters, migrations apply cleanly from empty. |
| API integration | `Budget.Api.Tests` | `WebApplicationFactory` + Testcontainers | Every commit. Auth redirects, cookie issuance, **tenant isolation**, rate limits, problem-details shape. |
| Front-end unit | `web` | Vitest, React Testing Library, MSW | Every commit. Hooks, sync queue, cycle display logic. |
| End-to-end | `tests/e2e` | **Playwright**, iPhone 15 device profile | **Local, on demand** against `docker compose`; optional `workflow_dispatch` in CI. One spec per user story in `docs/user-stories.md`; seeds from `fixtures/demo-seed.json`. |

TDD loop: failing test → minimal code → refactor. CI fails the PR on any red test or coverage drop below the threshold on Domain/Application (target 90%).

---

## 10. CI/CD (GitHub Actions)

### `ci.yml` — on pull request

1. Checkout; setup .NET 10 and Node 22.
2. `dotnet restore` / `dotnet build -warnaserror`.
3. `dotnet test` (Domain, Application, Infrastructure, Api) — Testcontainers uses the runner's Docker.
4. `npm ci && npm run lint && npm run test` in `src/web`.
5. CodeQL analysis.

### `deploy.yml` — on push to `main`

1. Run the same test steps (fail fast).
2. Build one Docker image (multi-stage Dockerfile: Node build of `web` → `dotnet publish` copying the build into `wwwroot` → runtime image). Also produce the EF **migration bundle** into the image.
3. Push to **GitHub Container Registry**, tagged with the git SHA and `latest`.
4. `azure/login` with **OIDC** federated credential (no secrets).
5. `az containerapp job start` for `budget-migrate` with the new image tag; **wait** and fail the workflow if the job fails.
6. `az containerapp update` for `budget-api` to the new image tag (new revision; ACA health-probes it before shifting traffic). Then `az containerapp job update` for `budget-rollover` and `budget-demo-reset` so the scheduled jobs run the same image.
7. Post a summary with the image tag. **Rollback** = re-run step 6 with the previous tag.

Environment protection on `production` requires a manual approval only if desired; default is auto-deploy on green.

---

## 11. Infrastructure as code (Bicep)

`infra/main.bicep` composes modules; `infra/parameters/prod.bicepparam` holds environment values. Deployed with `az deployment group create` (manually at first; later a `infra.yml` workflow with `what-if` on PR).

| Module | Resources |
|---|---|
| `monitoring.bicep` | Log Analytics workspace, Application Insights (workspace-based) |
| `storage.bicep` | Storage account (LRS), blob container `dataprotection` |
| `sql.bicep` | SQL logical server (Entra admin), Basic database, firewall rule *AllowAzureServices*, TDE default |
| `aca-environment.bicep` | Container Apps environment bound to the workspace |
| `aca-app.bicep` | Container App: ingress external 443, min 1 / max 3 replicas, HTTP scale rule, system-assigned identity, secrets (connection string, Entra client secret), env vars, health probes |
| `aca-jobs.bicep` | `budget-migrate` (manual trigger), `budget-rollover` (cron `5 * * * *`, parallelism 1, short replica timeout), `budget-demo-reset` (cron `0 17 * * *`). Cron expressions are UTC |
| `identity.bicep` | User-assigned identity + federated credential for the GitHub repo (`repo:rickychongjl/<repo>:ref:refs/heads/main`), role assignments (Contributor on the RG, AcrPull not needed — GHCR) |

Naming: `bgt-<env>-<resource>` (e.g. `bgt-prod-api`). Tags: `project=budget`, `env=prod`, `owner=ricky`.

Learning notes to capture as you go: modules and outputs, `existing` references, `@secure()` params, role assignment GUID derivation, and why `what-if` is the review step.

---

## 12. Observability

- **Application Insights** SDK in the API: automatic request, dependency (SQL), exception and performance telemetry with per-request correlation IDs; adaptive sampling on; log level `Information` in prod.
- **Structured logging** via `ILogger` with event IDs. Sign-in events log `oid`, IP (Cloudflare `CF-Connecting-IP`), user agent, and outcome — the audit trail.
- **Health:** `/health` (liveness, no DB) for ACA probes; `/health/ready` (DB ping) for the dashboard only, so a DB blip never restarts the container.
- **Rollover logging:** each job run logs users checked and cycles created. The request-time fallback logs a warning when it is the one that creates a cycle, because that means the job missed it.
- **Alerts:** failure rate > 5% over 5 min; P95 latency > 1 s; rollover job failed; demo-reset job failed; Cost Management budget alert at A$30/month.
- **Dashboards:** the built-in Failures and Performance blades; one saved KQL query for sign-ins.

---

## 13. Local development

- `docker-compose.yml`: `sql` (SQL Server 2022 Express, volume-backed), `api` (dev image, hot reload optional). `web` runs via `npm run dev` with Vite proxying `/api` and `/auth` to the API — same-origin behaviour preserved locally.
- Local auth: Entra works against `https://localhost:5001` as a registered redirect URI; a `Development`-only "dev login" endpoint is **not** provided — use the demo session locally instead to keep prod and dev auth identical.
- `make`/`just` targets or npm scripts: `up`, `test`, `test:e2e`, `migrate`, `rollover`, `reset-demo`. No scheduler runs locally; rollover happens through the request-time fallback, or by running the `rollover` target by hand.
- Windows host with Docker Desktop; Testcontainers and Playwright both supported.

---

## 14. Repository layout

```
budget-pwa/
├── CLAUDE.md
├── .claude/
│   ├── settings.json
│   ├── agents/
│   └── skills/
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
├── design-system/
│   └── budget/
│       ├── MASTER.md           ← UI source of truth
│       └── pages/              ← per-screen overrides
├── infra/
│   ├── main.bicep
│   ├── modules/
│   └── parameters/
├── src/
│   ├── Budget.Domain/
│   ├── Budget.Application/
│   ├── Budget.Infrastructure/
│   ├── Budget.Api/
│   ├── Budget.Jobs/
│   └── web/
├── tests/
│   ├── Budget.Domain.Tests/
│   ├── Budget.Application.Tests/
│   ├── Budget.Infrastructure.Tests/
│   ├── Budget.Api.Tests/
│   └── e2e/
│       ├── playwright.config.ts
│       ├── fixtures/
│       └── specs/
├── docs/
│   ├── solution-design.md      ← this file
│   ├── user-stories.md
│   └── adr/
├── docker-compose.yml
├── Budget.sln
└── README.md
```

---

## 15. Running cost (Australia East, approx.)

| Resource | Tier | AUD / month |
|---|---|---|
| Container App (0.25 vCPU / 0.5 GiB, min 1 replica, mostly idle) | Consumption | ~5–8 |
| Container Apps Jobs (migrate, hourly rollover, demo reset) | Consumption | ~0 (free grant; ~720 short rollover runs a month stay well inside it) |
| Azure SQL Database | Basic | ~7–8 |
| Storage account | LRS | < 0.10 |
| Log Analytics + Application Insights | Free 5 GB | 0 |
| Cloudflare | Free | 0 |
| GitHub (private repo, Actions, GHCR) | Free | 0 |
| Entra ID tenant | Free | 0 |
| Domain | — | ~1.50 |
| **Total** | | **~A$15–18** |

Levers: scale the container to zero (saves ~A$5, adds cold starts); move SQL to serverless free offer (saves ~A$7, adds wake-up latency and vCore-second accounting). Both are configuration changes.

---

## 16. Decisions log (ADRs to write in `docs/adr/`)

1. **Monolith over decoupled SPA** — one deployable, same-origin auth; split criteria documented.
2. **Azure Container Apps over App Service** — cheaper warm instance, scale-to-zero option, jobs for migrations.
3. **BFF cookie auth over SPA tokens** — tokens never reach the browser.
4. **Entra ID single-tenant over ASP.NET Identity** — MFA/passkeys for free, no password storage, no sign-up surface.
5. **Provisioned Basic SQL over serverless free offer** — latency requirement outweighs ~A$7/month.
6. **Migrations as a Container Apps Job** — runs inside Azure, before the new revision, no public DB path.
7. **Narrow repositories over generic `IRepository<T>`** — testability without leaking `IQueryable`.
8. **React over Vue** — job-market alignment; Vue already evidenced by day job.
9. **Playwright local by default** — hassle, not cost, is the constraint; CI run available on demand.
10. **GHCR over ACR** — free at this scale; ACA pulls public/private GHCR images with a PAT secret.
11. **Stored fixed 30-day cycles over date-derived monthly cycles** — only the current cycle's start date moves; future cycles follow; no user-set end dates.
12. **`CycleId` on transactions over deriving the cycle from `OccurredOn`** — moving a start date never re-buckets or orphans transactions, and past cycles stay stable.
13. **Per-cycle category snapshot (`CycleCategory`) over global category attributes** — reports on past cycles never change when a category is renamed or re-budgeted.
14. **Rollover by a scheduled Container Apps Job, with a request-time fallback** — one idempotent `RolloverCycles` use case, two triggers. Chosen over an in-process timer (needs a lock across replicas, breaks at scale-to-zero), Azure Functions (second deployable), a GitHub Actions schedule (unreliable timing, needs an admin endpoint) and SQL-side jobs (not on Basic; logic in T-SQL). Hourly and idempotent instead of "midnight Sydney", so daylight saving needs no handling.

---

## 17. Build order (suggested milestones)

1. Repo scaffold, solution, CLAUDE.md, docker-compose with SQL, CI green on an empty test.
2. Domain: cycle maths + rollups, TDD. (No UI, no DB.)
3. Infrastructure: DbContext, migrations, repositories, query filters, Testcontainers tests, tenant-isolation tests.
4. API: endpoints + problem details + rate limiting; `WebApplicationFactory` tests.
5. Auth: Entra tenant + app registration, BFF flow, `oid` allowlist, Data Protection to blob; demo session.
6. Web: shell, offline store, add-transaction flow, categories, budgets; Vitest.
7. Charts and reports.
8. PWA: manifest, service worker, install flow, offline sync; Playwright user-story specs.
9. Bicep: full environment; deploy workflow with migration job; Cloudflare in front.
10. Observability, alerts, README for interviewers, ADRs. Public repo.
