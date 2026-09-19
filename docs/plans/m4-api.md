# M4 plan: API (use cases, endpoints, problem details, rate limiting)

Source: `docs/solution-design.md` sections 3.2, 3.3, 4, 5.3 (caps only), 6 (rate limiting row) and section 17 item 4. No login flow, no UI.
Code lands in `src/Budget.Application` (use cases, DTOs, validators), `src/Budget.Api` (host and endpoints), `src/Budget.Jobs` (`migrate` only) and two new test projects, test first.

## Status: in progress

## Done when

- Every route in the table below answers through a use case, and no endpoint touches `BudgetDbContext` or a repository directly.
- Every error is `application/problem+json` with a stable `code`: `400` shape, `401`, `404`, `422` domain rule, `429`.
- User A gets `404` for user B's cycle, category and transaction ids on every `/api` route, and a test fails if a new `/api` route is added without an isolation case.
- `GET /api/cycles/current` creates the missing cycle(s) through `RolloverCycles` and logs a warning when it had to.
- `dotnet build -warnaserror` and `dotnet test` are green (Docker running). Domain and Application line coverage at or above 90%, enforced in the csproj like Domain.
- `docker compose up -d` brings up `sql`, runs `migrate`, then serves `/health` from the `api` container.

## Routes in M4

`GET|PATCH /api/me`, `GET|POST /api/cycles`, `POST /api/cycles/{id}/confirm`, `GET /api/cycles/current`, `GET|PATCH /api/cycles/{id}`, `POST /api/cycles/{id}/categories`, `PATCH|DELETE /api/cycles/{id}/categories/{categoryId}`, `GET /api/categories`, `GET|POST /api/transactions`, `PATCH|DELETE /api/transactions/{id}`, `POST /api/sync`, `POST /auth/demo`, `POST /auth/logout`, `GET /health`, `GET /health/ready`.

## Out of scope (and where it goes)

| Thing | Milestone |
|---|---|
| `/auth/login`, `/auth/callback`, `oid` allowlist, Data Protection to blob, anti-forgery | M5. `/auth/demo` and `/auth/logout` are slice 12 |
| Demo fixture (`fixtures/demo-seed.json`), `reset-demo` job | M5. Slice 12 only ensures the demo `User` row exists |
| `rollover` job entry point and its per-user DI scope | M5/M9. `RolloverCycles` itself is here; the job is a ten-line caller |
| `GET /api/reports/cycles` and its repository methods | M7, when the chart gives it a caller |
| `GET /api/me/export`, delete account | M10 |
| Security headers, CSP, HSTS, forwarded headers for the real client IP behind Cloudflare | M9, with the ingress they depend on |
| SPA static files and `index.html` fallback | M6 |

## Application

- One class per feature, plain constructor injection, no mediator and no interface per use case. `RolloverCycles` stands alone because it has two callers. Each class sits in its feature folder with its DTOs, validators and repository interface, and is mirrored by one endpoint file in `src/Budget.Api/Endpoints/`:

  | Class (file) | Methods | Routes |
  |---|---|---|
  | `Me` (`Users/Me.cs`) | `GetAsync`, `UpdateAsync` | `GET`/`PATCH /api/me` |
  | `Cycles` (`Cycles/Cycles.cs`) | `ListAsync`, `GetAsync`, `GetCurrentAsync`, `CreateFirstAsync`, `ConfirmAsync`, `UpdateAsync` | the six `/api/cycles` routes |
  | `CycleCategories` (`Categories/CycleCategories.cs`) | `AddAsync`, `EditAsync`, `RemoveAsync`, `ListIdentitiesAsync` | `/api/cycles/{id}/categories...`, `GET /api/categories` |
  | `Transactions` (`Transactions/Transactions.cs`) | `ListAsync`, `CreateAsync`, `EditAsync`, `DeleteAsync` | `/api/transactions...` |
  | `Sync` (`Transactions/Sync.cs`) | `ApplyAsync` | `POST /api/sync` |
  | `RolloverCycles` (`Cycles/RolloverCycles.cs`) | `RunAsync` | called by `Cycles.GetCurrentAsync` and the job |
- Each method loads through the repositories, builds a `CycleTimeline`, asks `User.Today(TimeProvider)` for today, calls the domain, saves through `IUnitOfWork`, returns a DTO record. Entities never leave Application.
- FluentValidation validators for request shape, using the column lengths from the M3 plan. Domain rules stay in Domain.
- Three exceptions, mapped once in the Api: FluentValidation's `ValidationException`, `NotFoundException`, `ConflictException`. `DomainException` already exists.
- Demo caps (20 categories, 500 transactions, notes 200 chars) checked in the use case when `User.IsDemo`. Needs `ITransactionRepository.CountAsync()`.
- `AddApplication()` registers the above.

Domain change: `User` gets `Rename` and `ChangeTimeZone` for `PATCH /api/me` (test first, in `Budget.Domain.Tests`).

Infrastructure change: `AddInfrastructure(connectionString)`; `BudgetDbContext.SaveChangesAsync` translates SQL Server unique violations (2601, 2627) into `ConflictException`, so `RolloverCycles` and the `ClientId` replay can recover from a race without Application seeing EF.

## Api

- Minimal API groups by feature under `Endpoints/`, all of `/api` behind `RequireAuthorization()`.
- `HttpCurrentUser : ICurrentUser` reads the `NameIdentifier` claim as a `Guid`; no claim means `Guid.Empty`, which the tenant filter already treats as "sees nothing, writes nothing".
- Cookie authentication is registered now with the production options (`HttpOnly`, `Secure`, `SameSite=Strict`), answering `401`/`403` instead of redirecting. M5 adds the endpoints that issue the cookie.
- One `IExceptionHandler` plus `AddProblemDetails`: `ValidationException` -> `400` with `errors`, `NotFoundException` -> `404`, `DomainException` -> `422`, `ConflictException` -> `409`. Every body carries `code`. Unhandled -> `500` with no detail. Logs carry the code and route, never the payload.
- JSON: camelCase, enums as strings, `DateOnly` as `yyyy-MM-dd`, money as a JSON number.
- Rate limiting: one global per-IP sliding window (config-bound, default 100 per minute), rejection is `429` problem details with `Retry-After`. `/health` is exempt.
- `/health` returns `200` with no dependencies; `/health/ready` runs `CanConnectAsync`.

## Slices (TDD order, one commit each)

### 1. Host skeleton and test harness
- `tests/Budget.Api.Tests`: `WebApplicationFactory<Program>` over one SQL Server container per run (same approach as M3: isolate by user, never reset). A test authentication handler replaces the cookie scheme and takes the user id from a header; it exists only in the test project.
- Tests: `/health` answers with the database unreachable; `/api/me` without a user is `401` problem details; an unknown `/api` route is `404` problem details; `GET /api/me` returns the profile.

### 2. `RolloverCycles`
- `tests/Budget.Application.Tests` with one in-memory `FakeStore` (all four repositories, unit of work and current user) and the same `FixedClock` the Domain tests use; no extra package.
- Nothing due is a no-op; several missed cycles are all created with categories copied; a `Draft`-only user is skipped; today is the user's time zone, not UTC; a `ConflictException` on save means the other trigger created the same cycles in its one save, so it reports nothing created and does not retry.
- Infrastructure tests: a lost unique index surfaces as `ConflictException` and the failed unit of work is cleared from the change tracker; a foreign-key violation is still EF's `DbUpdateException`.

### 3. Cycles, read side
- `GET /api/cycles` (phase per cycle), `GET /api/cycles/{id}` (rollup and totals), `GET /api/cycles/current` (runs the fallback; warning logged only when it created something; `404` with `cycle.none` before onboarding).

### 4. Onboarding and cycle edits
- `POST /api/cycles` creates the `Draft` and refuses a second cycle; `confirm`; `PATCH` for start date, opening and closing balance. The editability matrix comes back as `422` with the domain code.

### 5. Categories
- Add (new `Category` plus `CycleCategory`, or an existing `categoryId` into another cycle), edit, remove (`422 category.has-transactions`), `GET /api/categories` with the latest name.

### 6. Transactions
- List with the optional category filter, create, edit, delete. Create is idempotent on `ClientId`: a replay returns the original with `200`, not a second row. Writes in a past cycle set `requiresClosingBalanceReview`. A `Draft` cycle is `422 cycle.draft`.

### 7. Demo caps and `PATCH /api/me`
- Caps return `422` with `demo.cap.categories`, `demo.cap.transactions`, `demo.cap.note`. A non-demo user is never capped.

### 8. Tenant isolation sweep
- For every `/api` route taking an id: B's request against A's id is `404` and A's row is unchanged. Lists never include the other user's rows. A guard test enumerates `EndpointDataSource` and fails for any `/api` route the sweep does not cover.

### 9. Rate limiting
- The limit trips at the configured count with `429` problem details and `Retry-After`; `/health` is never limited.

### 10. `POST /api/sync`
- An ordered batch of transaction creates, edits and deletes and of category edits, each applied through the `Transactions` or `CycleCategories` use case in its own save. A category add or remove in a batch is rejected per item with `sync.online-only`. Per-item result: status, body or problem. One bad item does not stop the rest; replaying the whole batch changes nothing.

### 11. `migrate` and the compose `api` service
- `Budget.Jobs migrate` calls `Database.MigrateAsync`. `src/Budget.Api/Dockerfile`. Compose gains `migrate` (runs once, after `sql` is healthy) and `api` (after `migrate` completes).

### 12. Demo session (moved from M5)
- `POST /auth/demo` looks up the demo user and signs in on the cookie scheme with a 4-hour absolute expiry; `POST /auth/logout` signs out. `migrate` ensures exactly one `IsDemo` user exists, because the app never creates users.
- Without this the compose `api` service answers `/health` and `401` for everything else: nothing else can issue the cookie until Entra arrives, and there is deliberately no dev-login.
- Tests drive the real cookie: demo sign-in then `GET /api/me` succeeds with `isDemo: true`; the cookie is `HttpOnly`, `Secure`, `SameSite=Strict`; after logout the same client is `401`; `/auth/demo` has its own per-IP limit (5 per minute) and trips with `429`.
- Still M5: Entra login and callback, the `oid` allowlist, Data Protection keys in Blob Storage, the demo fixture (`demo-seed.json`) and the nightly `reset-demo` job.

## Decisions taken

Decisions 1 to 6 were reviewed and confirmed on 2026-09-19, with one change to decision 1: the demo session moves from M5 into this milestone as slice 12.

1. **The auth seam is the real cookie scheme, with nothing issuing the cookie yet.** Endpoints, `ICurrentUser` and the isolation tests are written against the production pipeline, and M5 only adds issuers. The alternative, a dev-login endpoint, is ruled out by CLAUDE.md. Until M5 the API is reachable only from tests.
2. **Another user's id is `404`, never `403`.** The tenant filter makes the row not exist; saying `403` would confirm that it does.
3. **`400` for request shape, `422` for domain rules, `409` only for a lost race the server could not recover from.**
4. **Demo caps are `422`, not `429`.** Retrying later will not help, which is what `429` promises. The design allows either.
5. **Feature classes, not one class per use case and no mediator.** About twenty routes of load, call the domain, save; a handler type and a registration per route would be most of the code.
6. **`POST /api/sync` carries transaction creates, edits and deletes, plus category and budget edits. Adding or removing a category is online only** (confirmed). An edit is idempotent and last-write-wins, so it replays safely with no schema change. A new category has a server-generated id and no `ClientId`, so a replay would duplicate it and a queued transaction could not reference it; a removal depends on "no transactions", which the queue can invalidate. **For M6:** the UI must make this plain while offline: the add and remove controls are disabled with a visible reason, not hidden and not left to fail. Recorded in design section 7.
7. **`Budget.Api.Tests` gets its own container fixture** rather than a shared test-support project. It is fifteen lines; a third project to share them is not worth the reference.
8. **The `/auth/*` rate-limit policy arrives with its first endpoint**, in slice 12, not with the global limiter in slice 9.
