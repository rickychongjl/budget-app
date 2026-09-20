# CLAUDE.md

Budget PWA: personal monthly budget tracker, built to production standard as a portfolio piece.
.NET 10 / ASP.NET Core / EF Core / SQL Server, React 19 + Vite + TypeScript, Azure Container Apps, Bicep, GitHub Actions.
Full spec: `docs/solution-design.md` (source of truth; read the relevant section before non-trivial work).

## Architecture

Monolith: one ASP.NET Core app serves `/api/*`, `/auth/*` and the React SPA (`wwwroot`, fallback to `index.html`). One container image, same-origin.

| Project | Responsibility |
|---|---|
| `src/Budget.Domain` | Entities, value objects, rules (cycle maths, rollups, carry-forward, money) |
| `src/Budget.Application` | Use cases, DTOs, **repository interfaces**, FluentValidation, demo caps |
| `src/Budget.Infrastructure` | EF Core `DbContext`, repository impls, migrations, global query filters |
| `src/Budget.Api` | Host: Minimal API endpoints grouped by feature, auth, rate limiting, Data Protection, Dockerfile |
| `src/Budget.Jobs` | Console host: `migrate`, `rollover`, `reset-demo`. Thin: each entry point calls an Application use case |
| `src/web` | React PWA; knows the API only via HTTP |

### Dependency direction (strictly inward)

```
Domain  <-  Application  <-  Infrastructure  <-  Api
                                   ^
                                 Jobs
```

- Domain references nothing.
- Application references Domain only. It must never reference EF Core or Infrastructure.
- Infrastructure references Application. Api references Application + Infrastructure. Jobs references Infrastructure.
- Never add a reference that points outward.

### Repository pattern scope

- One narrow interface per aggregate: `ICycleRepository`, `ICategoryRepository`, `ITransactionRepository`, `IUserRepository`. Declared in Application, implemented in Infrastructure.
- Intent-revealing methods (`GetForCycleAsync(userId, cycle)`).
- Never expose `IQueryable`. No generic `IRepository<T>`.
- `IUnitOfWork.SaveChangesAsync` wraps `DbContext.SaveChangesAsync`.
- Use-case tests run against in-memory fakes, not EF.

### Domain and data rules

- Money is `decimal(18,2)` and positive; direction comes from the category `Type` (Debit | Credit, immutable). A negative amount is a reversal.
- Cycles are stored rows, fixed at 30 days inclusive (`EndDate = StartDate + 29`). Users never set an end date.
- Current cycle = earliest cycle with `EndDate >= today` (user's `TimeZone`; use `TimeProvider`, never `DateTime.Now`).
- Only the current cycle's `StartDate` can change. It must be after the previous cycle's end (no overlap, gaps allowed), and future cycles are re-dated to follow. Past cycles never move.
- A transaction belongs to a cycle by `CycleId`, set at creation and never recomputed from `OccurredOn`.
- Category name, icon, colour, order and budget are a per-cycle snapshot on `CycleCategory`. `Category` is only the stable identity and type.
- Past cycles: categories, budgets, start date and opening balance are read-only (`422`). Closing balance and transactions stay editable; a past-cycle transaction write is flagged so the UI prompts for a closing balance update.
- Rollover: one idempotent Application use case, `RolloverCycles`, creates the next cycle(s) until one covers today, copying `CycleCategory` rows; it skips users whose only cycle is `Draft`. Two triggers call it and nothing else may duplicate its logic: the hourly `budget-rollover` job (primary) and `GET /api/cycles/current` (fallback; logs a warning if it had to create a cycle). The unique index on `Cycle (UserId, StartDate)` makes a race harmless.
- Cross-user jobs (`rollover`) keep the tenant filter on: list `User` rows, then open a DI scope per user with `ICurrentUser` set.
- The first cycle is `Draft` until the user confirms it; transactions need a `Confirmed` cycle.
- **Tenant isolation:** every table except `User` has `UserId`. `BudgetDbContext` applies a global query filter on `UserId`, stamps it on insert, and rejects updates that change it. Never bypass with `IgnoreQueryFilters` outside `reset-demo` and the seed.
- Transactions carry a `ClientId` (idempotency key for offline sync); `(UserId, ClientId)` is unique.
- Migrations must be backward-compatible with the previous app version (expand, migrate, contract): the migration job runs before the new revision goes live.
- Errors are RFC 9457 `application/problem+json`. Validation lives in Application.
- Users are never created at request time. `migrate` ensures the demo row and one row per `oid` in `Auth:AllowedOids`; an Entra sign-in needs both the allowlist entry and the row (`Login`). A refused sign-in issues no session and redirects to `/signin?error=<code>`, because the callback is a top-level navigation. `GET /auth/options` tells the SPA which sign-ins exist.
- Every non-GET under `/api` and the `/auth` POSTs is antiforgery-checked (`RequireCsrfToken`): the client gets a token from the JSON body of `GET /auth/csrf`, keeps it in memory (again after signing in or out) and sends it as `X-XSRF-TOKEN`. A new route group for writes must opt in. Outside Development antiforgery needs the request to be https.
- No PII in logs.

## UI work

Before any change under `src/web` that affects how something looks, moves or is interacted with:

1. Read `design-system/budget/MASTER.md`.
2. If `design-system/budget/pages/<page>.md` exists for the screen, its rules override MASTER for that screen.
3. Run MASTER section 14 ("Before a UI change is done") before calling the work finished.

Hard rules (details in MASTER):

- Semantic tokens only (`--color-*`, `--cat-*`, `--space-*`, `--radius-*`, `--text-*`). No raw hex or ad hoc values in components.
- Light and dark are both first-class, toggled by `data-theme` on `<html>` (System / Light / Dark).
- Red means over budget or destructive, green means ahead of target or success. Nothing else. Status is always colour plus icon plus word.
- A category's `Colour` is a palette slot name (`"blue"`) and its `Icon` is a Lucide icon name. Never hex.
- Amounts use tabular numerals and the shared money formatter.
- Touch targets 44px or larger, safe-area insets, no hover-only behaviour, `prefers-reduced-motion` respected.
- Inter is self-hosted. No CDN fonts (CSP and offline). No animation library, no glass or blur, no pie charts.
- Do not change MASTER to fit a component. If a rule is wrong, raise it.

### Web app rules (`src/web`, full reasoning in `docs/plans/m6-web.md`)

- `api/client.ts` is the only caller of `fetch`. It holds the antiforgery token in memory and retries once on `csrf.invalid`. Errors are `ProblemError` (the server refused; switch on `code`) or `NetworkError` (no answer; keep and retry).
- **What a screen shows is `overlay(server snapshot, outbox)`.** Reads go through `useCachedQuery` (TanStack Query, with each answer also kept whole in Dexie). A write that must work offline (transaction create, edit, delete; category edit and reorder) never calls its own endpoint: it goes through `enqueue`, and `drain()` posts the queue to `/api/sync`. `offline/overlay.ts` is the only place the front end does rollup maths, and only for rows the server has not counted; it must stay in step with `CycleRollup.Line`.
- A write that needs the server to decide something (onboarding, category add and remove, start date, balances, profile) calls its endpoint directly, is disabled offline, and says "needs a connection" on screen.
- Whether a write landed in a past cycle is the server's call (`requiresClosingBalanceReview`); never work it out from dates. "Today" is `todayIn(me.timeZone)`, never the device's date. Dates are `YYYY-MM-DD` strings and are never passed to `new Date(string)`.
- A CSS grid whose child truncates needs `grid-template-columns: minmax(0, 1fr)`, or one long name makes the page scroll sideways. A hidden radio that takes the tap must fill its box with no border on the box, or the target drops under 44px.
- `GET /api/reports/cycles` is `CycleSummary[]`, the same record as one cycle. The Cycles page reads only that: the chart and the list are drawn from one answer, and `overlaySummary` maps over it so a queued transaction moves both. Do not add a slimmer report DTO.
- Chart rules live in `features/cycles/trend.ts` and are tested there, not in a component: what is plotted, the summary sentence and the axis ticks. Recharts is loaded with `React.lazy` and must stay out of the entry chunk. Colours are read from the tokens at render time (`theme/cssColour.ts`) and re-read when `data-theme` changes; a chart never holds a hex.
- No two files in a folder may differ only by case (`Keypad.tsx` and `keypad.ts`): Windows resolves them to the same file and the import breaks there but not on CI. The same trap applies across extensions: `Trend.tsx` beside `trend.ts` resolves to one file, so the chart components are `TrendChart`, `TrendSection`, `TrendFilter`.
- `tokens.test.ts` fails on a raw colour outside `tokens.css`, and on a token missing from one theme.
- `/kit` (dev server only, dropped from the production build) shows every `ui/` component in every state.

## TDD loop

Failing test, minimal code, refactor. Write the test first, watch it fail for the right reason, then implement.

| Tier | Project | Notes |
|---|---|---|
| Domain unit | `tests/Budget.Domain.Tests` | xUnit + FluentAssertions. Cycle maths, rollups, carry-forward. Always first. |
| Application unit | `tests/Budget.Application.Tests` | xUnit + NSubstitute + in-memory fakes. Use cases, validation, demo caps. |
| Infrastructure integration | `tests/Budget.Infrastructure.Tests` | Testcontainers, `mcr.microsoft.com/mssql/server:2022-latest`. Repositories, query filters, migrations apply from empty. |
| API integration | `tests/Budget.Api.Tests` | `WebApplicationFactory` + Testcontainers. Auth, cookies, **tenant isolation (user A cannot touch user B via any endpoint)**, rate limits, problem-details shape. |
| Web unit | `src/web` | Vitest + React Testing Library + MSW + `fake-indexeddb`. An undeclared request fails the test. jsdom has no `showModal` or `matchMedia` (stand-ins in `src/test/setup.ts`), so focus trap, Escape and focus return on sheets and dialogs are not covered here. jsdom lays out no SVG either, so a chart is checked for its name, its table and its cards, never its pixels. Workers are capped at four: one jsdom per core plus Recharts runs the heap out of memory, and files that die that way are reported as passing. |
| E2E | `tests/e2e` | Playwright, iPhone 15 profile, local on demand. One spec per story in `docs/user-stories.md`; seeds from `fixtures/demo-seed.json`. |

Any red test fails the PR. Coverage on Domain and Application must stay at or above 90%.

## Commands

Run from the repo root unless stated.

```
# Build (CI uses warnings as errors)
dotnet restore
dotnet build -warnaserror

# Test (Docker must be running; Testcontainers starts SQL Server)
dotnet test
dotnet test tests/Budget.Domain.Tests        # fast inner loop, no Docker; fails under 90% line coverage (coverlet.msbuild, set in the csproj)

# Migrations (dotnet-ef is pinned in dotnet-tools.json; needs no database)
dotnet tool restore
dotnet ef migrations add <Name> --project src/Budget.Infrastructure

# Web (in src/web)
npm ci
npm run lint                                  # oxlint; warnings fail
npm run test
npm run build                                 # tsc -b, then vite build
npm run dev                                   # Vite; proxies /api and /auth to http://localhost:8080 (API_TARGET=... to point elsewhere). /kit shows the UI kit

# Local stack
docker compose up -d --build                  # sql, then migrate (runs once), then api + the built SPA on http://localhost:8080; needs .env (see .env.example)
docker compose down

# Jobs (same image; migrate also seeds the demo from tests/e2e/fixtures/demo-seed.json when it is empty)
docker compose run --rm --entrypoint "dotnet jobs/Budget.Jobs.dll reset-demo" migrate
docker compose run --rm --entrypoint "dotnet jobs/Budget.Jobs.dll rollover" migrate

# E2E (against docker compose)
npx playwright test --config tests/e2e/playwright.config.ts
```

Planned convenience targets (`make`/`just` or npm scripts; not yet created, check before assuming they exist): `up`, `test`, `test:e2e`, `migrate`, `rollover`, `reset-demo`. No scheduler runs locally; rollover happens through the request-time fallback.

Local auth: use the demo session (`GET /auth/csrf`, then `POST /auth/demo` with the token). There is deliberately no dev-login endpoint. Entra sign-in works locally on `https://localhost:5001` once `Entra:*` and `Auth:AllowedOids` are in user-secrets (one-time setup: `docs/tenant_app_registration_setup.md`); without them `/auth/login` is `404`.

## Decisions not to re-litigate

These are settled (see design doc section 16). Do not propose alternatives or refactor toward them unless asked.

1. **Monolith**, not a decoupled SPA. Same-origin cookie auth, one deployable.
2. **Azure Container Apps** over App Service. Migrations run as a Container Apps Job.
3. **BFF cookie auth**: server does OIDC, cookie is `HttpOnly`/`Secure`/`SameSite=Strict`. Tokens never reach the browser. No SPA token handling, no localStorage tokens.
4. **Entra ID single-tenant** plus an `oid` allowlist, not ASP.NET Identity. No registration endpoint, no passwords.
5. **Provisioned Azure SQL Basic**, not serverless.
6. **Narrow repositories**, no generic `IRepository<T>`, no `IQueryable` leakage.
7. **React** (not Vue).
8. **Playwright runs locally** by default; CI run is optional `workflow_dispatch`.
9. **GHCR** over ACR.
10. **Stored fixed 30-day cycles**, not date-derived monthly cycles. No `CycleStartDay`, no `"yyyy-MM"` keys, no user-set end dates.
11. **`CycleId` on transactions**, not cycle-by-date lookup.
12. **Per-cycle category snapshot** (`CycleCategory`), not global category attributes.
13. **Rollover by an hourly Container Apps Job plus a request-time fallback**, both calling `RolloverCycles`. Not an in-process timer, Azure Functions, a GitHub Actions schedule or SQL jobs. Hourly and idempotent, so no daylight-saving logic.
14. **Demo user is a normal `User` row** (`IsDemo = true`) through every real code path, with abuse caps in Application and a nightly reset job. Do not special-case it around tenant isolation.

Also fixed: offline-first PWA (Dexie + `POST /api/sync`, replays idempotent via `ClientId`); Data Protection key ring in Blob Storage with managed identity (no connection strings); secrets never in the repo; pipeline auth via OIDC federated credential; infra as Bicep with `what-if` as the review step.

## Conventions

- Match surrounding code style; keep comments sparse and explain why, not what.
- Namespaces are `Budget.*` (working name; do not rename unprompted).
- Group files into folders; do not leave types loose in a project root. A new file goes in the folder it belongs to, and a new aggregate gets its own folder.
  - `Budget.Domain`: one folder per aggregate (`Cycles/`, `Categories/`, `Transactions/`, `Users/`). Only types shared by every aggregate (`Money`, `DomainException`) stay in the root.
  - `Budget.Application`: one folder per feature (`Users/`, `Cycles/`, `Categories/`, `Transactions/`), each holding that feature's use-case class, DTOs, validators and repository interface, plus `Errors/` for the exceptions the Api maps to status codes. Only `IUnitOfWork` and `DependencyInjection` stay in the root.
  - `Budget.Infrastructure`: by role (`Persistence/` for the `DbContext` and its factory, `Repositories/`, `Migrations/`).
  - Folders are for navigation only: the namespace stays the project's (`Budget.Domain`, `Budget.Infrastructure`), so moving a file never touches a `using`. `Migrations` keeps EF's generated namespace.
- Azure naming `bgt-<env>-<resource>`; tags `project=budget`, `env=prod`, `owner=ricky`.
- Health: `/health` is liveness and must not touch the DB; `/health/ready` pings the DB and is for dashboards only.
- New behaviour needs a test in the lowest tier that can express it.
