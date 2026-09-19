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

## TDD loop

Failing test, minimal code, refactor. Write the test first, watch it fail for the right reason, then implement.

| Tier | Project | Notes |
|---|---|---|
| Domain unit | `tests/Budget.Domain.Tests` | xUnit + FluentAssertions. Cycle maths, rollups, carry-forward. Always first. |
| Application unit | `tests/Budget.Application.Tests` | xUnit + NSubstitute + in-memory fakes. Use cases, validation, demo caps. |
| Infrastructure integration | `tests/Budget.Infrastructure.Tests` | Testcontainers, `mcr.microsoft.com/mssql/server:2022-latest`. Repositories, query filters, migrations apply from empty. |
| API integration | `tests/Budget.Api.Tests` | `WebApplicationFactory` + Testcontainers. Auth, cookies, **tenant isolation (user A cannot touch user B via any endpoint)**, rate limits, problem-details shape. |
| Web unit | `src/web` | Vitest + React Testing Library + MSW. |
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
dotnet test tests/Budget.Domain.Tests        # fast inner loop, no Docker

# Web (in src/web)
npm ci
npm run lint
npm run test
npm run dev                                   # Vite; proxies /api and /auth to the API

# Local stack
docker compose up -d                          # sql (SQL Server 2022 Express); api service arrives in M4
docker compose down

# E2E (against docker compose)
npx playwright test --config tests/e2e/playwright.config.ts
```

Planned convenience targets (`make`/`just` or npm scripts; not yet created, check before assuming they exist): `up`, `test`, `test:e2e`, `migrate`, `rollover`, `reset-demo`. No scheduler runs locally; rollover happens through the request-time fallback.

Local auth: use the demo session (`POST /auth/demo`). There is deliberately no dev-login endpoint.

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
- Azure naming `bgt-<env>-<resource>`; tags `project=budget`, `env=prod`, `owner=ricky`.
- Health: `/health` is liveness and must not touch the DB; `/health/ready` pings the DB and is for dashboards only.
- New behaviour needs a test in the lowest tier that can express it.
