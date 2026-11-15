# Multi-user audit (L0)

**Audited:** `main` at `b16fcc8` (PR #38), 15 Nov 2026. Read-only; no code changed.
**Question:** what does the codebase already do for multiple users, and what is missing before strangers can sign up and pay?

## Summary

The data layer is already multi-user. The app is single-user only at the front door: sign-in admits allowlisted Entra object ids, and user rows are created by the `migrate` job, never by a request. Opening sign-up is a change to `Login`, `RealUsers`, `EntraSignIn` and the sign-in screen, not a schema rework.

Nothing exists yet for plans, billing, export, account deletion, public pages or a second environment.

## 1. Already in place (do not rebuild)

| Area | Where | What it does |
|---|---|---|
| `UserId` on every tenant table | `src/Budget.Infrastructure/Persistence/BudgetDbContext.cs` | `Cycle`, `Category`, `CycleCategory`, `Transaction` all carry `UserId`. Child FKs are composite and include `UserId`, so the database refuses a row pointing at another user's parent. |
| Read isolation | same file, `HasQueryFilter(x => x.UserId == CurrentUserId)` | Global query filter on all four tenant tables. |
| Write isolation | same file, `EnforceTenant()` | Stamps `UserId` on insert; throws if any added, modified or deleted row is not the current user's, or if there is no current user. |
| Current user | `src/Budget.Application/Users/ICurrentUser.cs`, `src/Budget.Api/Auth/HttpCurrentUser.cs`, `JobUser` in `src/Budget.Jobs/JobHost.cs` | `Guid.Empty` means nobody: reads return nothing, writes throw. |
| Cross-user attack tests | `tests/Budget.Api.Tests/TenantIsolationTests.cs`, `tests/Budget.Infrastructure.Tests/TenantIsolationTests.cs` | User B aims every id-taking route at user A's rows and must get 404 with A's data unchanged. A guard test fails when a new `/api` route is added without an attack or a stated reason. |
| Session | `src/Budget.Api/Program.cs`, `Auth/EntraSignIn.cs`, `Auth/Csrf.cs` | BFF cookie (`HttpOnly`, `Secure`, `SameSite=Strict`, 30-day sliding), antiforgery on every write, no tokens in the browser. The session carries only the app's `User.Id`. |
| Per-user jobs | `JobHost.RolloverAsync` | Lists users, then runs each in its own DI scope as that user. One failure does not stop the rest. |
| Demo user | `Users/DemoUser.cs`, `DemoCaps.cs`, `ResetDemo.cs` | A normal `User` row with `IsDemo = true`, shared by all visitors, capped, reset nightly. Reset runs as the demo user, so it cannot touch anyone else. |
| First-run flow | `src/web/src/features/onboarding/`, first cycle is `Draft` until confirmed | A user with no data is taken through categories, start date, opening balance, confirm. |
| Rate limiting | `src/Budget.Api/RateLimiting/RateLimiting.cs` | 100 requests a minute per client address; 5 a minute on `/auth/*`. |
| Hosting | `infra/modules/sql.bicep`, `aca-app.bicep` | Azure SQL **Basic** (not serverless), Container App `minReplicas: 1`, `maxReplicas: 3`. Already the right shape for real users. |
| Edge | `src/Budget.Api/Hosting/Edge.cs` | CSP `default-src 'self'`, HSTS, Cloudflare client address. |

## 2. What blocks open sign-up

| # | Finding | Where | Consequence |
|---|---|---|---|
| A1 | Sign-in needs an allowlist entry **and** an existing row; `Login` never creates a user. | `Users/Login.cs`, `Users/AllowedOids.cs` | A stranger cannot get in. This is settled decision 4 in `AGENTS.md` and must be explicitly revised. |
| A2 | Real users are created only by `migrate`, one per allowlisted oid. | `Users/RealUsers.cs` | Needs first-sign-in provisioning. Two concurrent first sign-ins must not create two rows (unique index on `ExternalId` exists; the loser must retry the read). |
| A3 | The authority is Ricky's single workforce tenant. | `Auth/EntraSignIn.cs` | Only accounts in that tenant can authenticate. The handler is the plain ASP.NET OpenID Connect handler (`Microsoft.Identity.Web` was dropped in M5), so pointing it at another OIDC authority is configuration plus claim mapping, not a rewrite. |
| A4 | `User` has no email and no plan. Columns: `Id`, `ExternalId`, `DisplayName`, `IsDemo`, `TimeZone`, `Currency`, `CreatedAt`. | `src/Budget.Domain/Users/User.cs` | Nothing to contact a user with; nothing to hang a subscription on. |
| A5 | New rows are created as `"Me"`, `Australia/Sydney`, `AUD`. Onboarding reads `me.timeZone` but does not ask for it. | `RealUsers.cs`, `features/onboarding/Onboarding.tsx` | A sign-up in Perth or Brisbane gets the wrong "today" during daylight saving unless the first run captures the device time zone. |
| A6 | The sign-in screen offers "Try the demo" and "Sign in with Microsoft" only, and an `auth.not-allowed` refusal message. | `src/web/src/features/auth/SignIn.tsx` | Needs sign-up wording and provider buttons. `design-system/budget/MASTER.md` section 8 says Microsoft's logo is the only third-party brand asset; adding Google or Apple buttons needs that rule raised with Ricky, not edited around. |

## 3. Missing entirely

| # | Gap | Notes for the agent that builds it |
|---|---|---|
| B1 | **Data export.** The design doc's security table says `GET /api/me/export` exists; it does not. | New route must be added to `TakesNoIds` in the API isolation test with its own two-user test. |
| B2 | **Account deletion.** No endpoint. | Every FK is `Restrict`, so the order is `IUserRepository.DeleteDataAsync` (children first, already written, only works when the scope runs as that user), then the `User` row. `DeleteDataAsync` must be extended whenever a new tenant table is added. |
| B3 | **Plans and entitlements.** None. | `DemoCaps` is the existing pattern for "this user may not add another X": an Application-layer check that throws a `DomainException` with a code. Follow it. |
| B4 | **Billing.** None. | A webhook route sits outside `/api` (no session, no antiforgery; verified by signature). It acts for a user without a request user, so it needs its own scoped `ICurrentUser`, the way `JobUser` does it. Any new table needs `UserId`, a query filter and a line in `DeleteDataAsync`. |
| B5 | **Public pages.** The SPA shows only the sign-in screen when signed out. No pricing, privacy policy or terms. | The service worker's navigation denylist and the CSP both need checking for any new public route. |
| B6 | **Second environment.** `infra/parameters/prod.bicepparam` only. | `main.bicep` already takes `env`; names are `bgt-<env>-<resource>`. |
| B7 | **E2E as more than one user.** Playwright runs as the one shared demo user, one worker, and there is deliberately no dev-login endpoint. | A two-user browser test needs a decision on how a second user signs in under test. |

## 4. Things that will bite later (not blockers)

- **Rollover job is one pass over all users, hourly.** Fine for hundreds. At thousands it wants batching or a "users whose cycle ends today" query.
- **`SameSite=Strict` and returning from Stripe.** The first navigation back from an external site carries no cookie; the SPA loads and its own `fetch('/api/me')` does. This already works for the Entra callback. A return URL must be an SPA route, never an `/api` route that needs the session.
- **Auth rate limit is 5 a minute per address.** A sign-up round trip is one `/auth/login`; the callback is under the global limit only. Leave it, but watch it during a beta from one office network.
- **Logs.** Only two log lines exist in `src` (`Cycles.cs`, `EntraSignIn.cs`); neither carries personal data. Keep it that way: an email address must never be logged.
- **The demo is shared.** Concurrent visitors see each other's entries. Acceptable for a "try it" button; say so on the public page.
- **Coverage gate.** Domain and Application must stay at or above 90% line coverage; new use cases need tests in those tiers first.

## 5. Settled decisions this work must revise

These are in `AGENTS.md` under "Decisions not to re-litigate" and the "Domain and data rules" list. Ricky has asked for the change; the first task updates the text so later agents are not told the opposite.

- Decision 4: "Entra ID single-tenant plus an `oid` allowlist... No registration endpoint."
- Rule: "Users are never created at request time."
- `docs/solution-design.md` sections 1 (non-goals), 5.1 and 16.

Everything else in that list stands, including the monolith, BFF cookie, Basic SQL, narrow repositories and the demo user as a normal row.
