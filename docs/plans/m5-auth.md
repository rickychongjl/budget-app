# M5 plan: Auth (Entra BFF login, `oid` allowlist, Data Protection, demo fixture, jobs)

## Status: implemented, except the manual Entra steps

All slices are in. 303 tests: Domain 119, Application 82, Infrastructure 34, API 68 (the last two against a SQL Server 2022 container). Line coverage: Application 95.23%, Domain 98.66%. `docker compose up -d --build` was run for real: `migrate` applied the migrations, ensured the users and seeded the demo; a curl session got `404` from `/auth/login` (Entra unconfigured), `400` from `/auth/demo` without an antiforgery token and `204` with one, read the seeded current cycle, added a transaction (11 to 12), and `reset-demo` put it back to 11; `rollover` ran per user with no failures.

Not done, and not doable from here: the Entra tenant and app registration (one-time guide: `docs/tenant_app_registration_setup.md`). Until then the real sign-in is proven only by the tests, which run the real OpenID Connect middleware against an in-memory tenant.

Where the code differs from the plan below:

- **Plain `AddOpenIdConnect`, not `Microsoft.Identity.Web`** (decision 7's fallback, taken before writing code rather than after a fight). `Microsoft.Identity.Web`'s issuer validator fetches Entra metadata over the network with its own HTTP client, so the no-network callback test would have had to swap the production validator out, which is the thing under test. For one tenant the plain handler is the same flow: code + PKCE by default, issuer pinned by the tenant authority's metadata. It also drops MSAL from the dependency tree.
- **Outside Development, antiforgery refuses to work without TLS**, so over plain http there is no token and no session at all (it throws, which is a `500`). The M4 test that pinned "Production is `Secure` even over http" became "Production over http gets nothing". **This makes M9's forwarded headers mandatory, not optional:** behind the Container Apps ingress the app sees http until `X-Forwarded-Proto` is honoured, and every write would fail.
- Sign-in failures are two codes, both `403`: `auth.not-allowed` (the `oid` is not on the allowlist, or has no row) and `auth.failed` (anything else in the round trip: bad signature, cancelled, replayed state).
- `/auth/callback` is answered by the OpenID Connect middleware, not an endpoint, so it is under the global rate limit but not the strict `/auth` policy, and it is not antiforgery-checked (it is protected by the handler's own state and nonce cookies).
- `Auth:AllowedOids` is one comma-separated setting (`Auth__AllowedOids`), so the API and the jobs read the same variable the same way. Oids are compared and stored lower-case.
- Data Protection: the blob test was written, then removed. A host with `DataProtection:BlobUri` set warms the key ring at startup with a real call to Azure (40 seconds and a real network call per run). Only "unset means local" is tested; the `ponytail:` note in `DataProtectionTests` names Azurite as the upgrade.
- The API tests keep the real antiforgery check on for the whole suite: `ClientFor` and `CsrfClient` fetch a token before each write, like the SPA wrapper will. `CsrfTests` use plain clients. The shared host's `/auth` limit is raised like the global one, because every test shares an address.
- The fixture places a transaction by day offset, not by cycle index: it lands in whichever cycle covers its day.
- Slices 1-2 and 7-8 were committed as pairs (they share the DI registration and the job host). Red-first was seen for slice 3 (the five sign-in tests failed on a metadata fetch until the test used a static configuration manager) and slice 4 (rate limit and TLS findings above); the rest could not compile until the code existed.
- The https launch profile moved from port 7148 to 5001 to match the redirect URI in the design, and `Budget.Api` has a `UserSecretsId`.

## Context

M4 left the API reachable only through the demo session: the production cookie scheme is registered (`src/Budget.Api/Program.cs`), `/auth/demo` and `/auth/logout` issue and clear it, but nothing signs the real user in. M5 (design section 17 item 5, sections 5 and 6 "Auth" row) adds the real issuer, and picks up what M4 explicitly deferred to it: `/auth/login` + `/auth/callback`, the `oid` allowlist, anti-forgery, Data Protection keys in Blob Storage, `demo-seed.json`, the `reset-demo` job and the `rollover` job entry point.

Outcome: Ricky can sign in with Entra locally (`https://localhost:5001`) and get the same cookie the demo gets; nobody else can; the demo has data and resets nightly; all three job entry points exist.

First implementation step is to commit this plan as `docs/plans/m5-auth.md` (same shape as `m4-api.md`), then one commit per slice, test first.

## Done when

- `GET /auth/login` redirects to Entra with authorization code + PKCE; the callback signs in on the existing cookie scheme only when the token's `oid` is on the allowlist **and** maps to a `User` row. Anything else is `403` problem details and no cookie.
- Real session: sliding 30 days. Demo session unchanged (4 h absolute, `AllowRefresh = false`).
- State-changing requests without the anti-forgery header are refused.
- With `DataProtection:BlobUri` set, the key ring persists to blob via managed identity; unset (local, tests) it uses the default.
- `Budget.Jobs` runs `migrate`, `rollover`, `reset-demo`; each is a thin caller of an Application use case.
- `docker compose up -d --build` gives a demo session with cycles, categories and transactions in it.
- `dotnet build -warnaserror` and `dotnet test` green; Domain and Application coverage at or above 90%.

## Out of scope

| Thing | Milestone |
|---|---|
| Creating the Entra tenant and app registration | Manual, by Ricky (steps go in the plan doc). Code and tests do not need it |
| Security headers, CSP, HSTS, forwarded headers | M9 |
| The Bicep for the storage account, role assignment, job schedules | M9 |
| "20 a day" demo limit, server-side session store | Not planned (`ponytail:` note already in `RateLimiting.cs`) |
| Login button, 403 screen | M6 |

## Reuse (already there)

- Cookie scheme and its options: `src/Budget.Api/Program.cs`. M5 only adds `ExpireTimeSpan = 30 days`, `SlidingExpiration = true`.
- Sign-in shape (one `NameIdentifier` claim holding `User.Id`): `src/Budget.Api/Auth/AuthEndpoints.cs`; `HttpCurrentUser` reads it.
- `IUserRepository.GetByExternalIdAsync`, `ListAsync`, unique index on `User.ExternalId`: already in place for login and rollover.
- `DemoUser.EnsureExistsAsync` (`src/Budget.Application/Users/DemoUser.cs`): pattern for "migrate ensures the row".
- `RolloverCycles.RunAsync`: the job calls it per user, nothing else.
- `RateLimiting.AuthPolicy` on the `/auth` group; `ProblemExceptionHandler`; `HostTests.ShouldBeProblem`; `FakeStore`; `ApiFactory`.

## Slices (TDD order, one commit each)

### 1. `Login` use case and the allowlist (Application)
- `src/Budget.Application/Users/Login.cs`: `ResolveAsync(oid)` returns the `User.Id` when the `oid` is in `AllowedOids` and a row with that `ExternalId` exists; otherwise throws a new `ForbiddenException("auth.not-allowed")` (`Errors/`), mapped to `403` in `ProblemExceptionHandler`.
- Allowlist is a small options record bound from `Auth:AllowedOids` in the hosts. Empty list admits nobody.
- Tests (`FakeStore`): allowed + row; allowed without row; row without allowlist entry (tenant misconfiguration case); the demo user can never be resolved this way.

### 2. `migrate` ensures the real user rows
- `RealUsers.EnsureExistAsync` beside `DemoUser`: one `User` per allowlisted `oid` that has none (`"Me"`, `Australia/Sydney`, `AUD`; editable through `PATCH /api/me`). Idempotent. The app still never creates users at request time.
- `Budget.Jobs` reads `Auth__AllowedOids`; compose passes it through from `.env` (optional).

### 3. Entra sign-in (Api)
- Packages: `Microsoft.Identity.Web` (design 5.2). Registered only when `Entra:ClientId` is configured, with `CallbackPath = /auth/callback`, code flow + PKCE, ID token only, signing in on the existing cookie scheme.
- `GET /auth/login` = `Results.Challenge(RedirectUri "/")` in the rate-limited `/auth` group; `404` when Entra is not configured (compose default).
- `OnTokenValidated`: read `oid`, call `Login.ResolveAsync`, replace the principal with the single `NameIdentifier = User.Id` claim, `IsPersistent = true`. No token is stored (`SaveTokens = false`). `OnRemoteFailure` and a refused `oid` answer `403 auth.not-allowed` problem details. Logs carry the code only, never the `oid` or name.
- Note for M6: the cookie is `SameSite=Strict`, so the browser does not send it on the redirect to `/` that ends the cross-site chain. Harmless here: `/` is the static SPA and its first `fetch('/api/me')` is same-origin.
- API tests, no network: a static `OpenIdConnectConfiguration` with a test signing key, and a stub `Backchannel` handler that answers the token request with a signed ID token.
  - `/auth/login` is a `302` to the authorize endpoint with `response_type=code`, `code_challenge`, the client id and the `/auth/callback` redirect URI.
  - Callback with an allowed `oid`: hardened cookie, `GET /api/me` works, `isDemo: false`, expiry about 30 days.
  - Callback with an unknown `oid`, and with an allowed `oid` that has no row: `403`, no session cookie.
  - Not configured: `/auth/login` is `404`, demo still works.

### 4. Anti-forgery
- ASP.NET Core antiforgery (`AddAntiforgery`, header `X-XSRF-TOKEN`). Tokens are protected by the Data Protection key ring, so slice 5 makes them survive deploys and replicas too.
- `GET /auth/csrf` (global rate limit only, not the strict `/auth` policy): `IAntiforgery.GetAndStoreTokens` for whoever the caller is now; the cookie token stays `HttpOnly`, the request token goes in a readable `XSRF-TOKEN` cookie (`Secure` as the session cookie, `SameSite=Strict`). `204`.
- One endpoint filter on the `/api` group and the `/auth` POSTs: any non-GET calls `IAntiforgery.ValidateRequestAsync`; failure is `400 csrf.invalid` problem details. (`UseAntiforgery` alone only checks form-bound endpoints, not JSON ones.)
- The request token is bound to the signed-in user, so the SPA fetches it on load and again after sign-in and sign-out, keeps it in memory, and on `400 csrf.invalid` refetches and retries once. One GET per app load, none per request. Note for M6/M8: the sync replay goes through the same wrapper.
- Tests: a delegating handler in `ApiFactory` fetches the token before a client's first write, so existing tests are unchanged. New: a write without the header is `400`; with a token issued to user A but sent as user B is `400`; an anonymous token works for `/auth/demo` and the pre-sign-in token is refused afterwards; GET is unaffected.

### 5. Data Protection to Blob Storage
- Packages: `Azure.Extensions.AspNetCore.DataProtection.Blobs`, `Azure.Identity`. `AddDataProtection().SetApplicationName("budget")`, plus `PersistKeysToAzureBlobStorage(new Uri(DataProtection:BlobUri), new DefaultAzureCredential())` only when the setting is present.
- Test: host starts and a demo session works with the setting absent. `ponytail:` no automated test of the blob path (needs Azure or Azurite); proven at the M9 deploy by a cookie surviving a revision.

### 6. Per-user job scope and `rollover`
- `Budget.Jobs`: replace `Nobody` with a scoped settable `JobUser : ICurrentUser` (default `Guid.Empty`, so `migrate` behaves as now).
- `rollover`: `IUserRepository.ListAsync()`, then one DI scope per user with `JobUser.Id` set, calling `RolloverCycles.RunAsync`. Tenant filter stays on. One user failing logs the code and continues; exit code non-zero if any failed. Logs a count, no names.
- Test: Infrastructure-tier test over the real container, two users both behind, one run rolls both and neither sees the other's rows. The loop lives in a small `Budget.Jobs` static method the test can call (test project references Jobs).

### 7. Demo fixture and `ResetDemo`
- `tests/e2e/fixtures/demo-seed.json`: dates as day offsets from today. First cycle start offset (about -70, giving two past cycles and a current one), opening and closing balances, categories (type, name, Lucide icon, palette slot, budget, order), transactions (cycle index, category key, amount, day offset, note). All within the demo caps.
- `src/Budget.Application/Users/ResetDemo.cs`: `RunAsync(fixture)` deletes the demo user's rows then rebuilds them through the domain types (`Cycle`, `Confirm`, `CreateNext`, `CycleTimeline`), saving through `IUnitOfWork`. If the domain lacks a seam to build a past cycle with balances, that gets a Domain test first.
- `IUserRepository.DeleteDataAsync(userId)`: four `ExecuteDeleteAsync` in FK order (Transaction, CycleCategory, Cycle, Category) with an explicit `UserId` predicate, filter left on. M10's delete-account reuses it.
- `ponytail:` delete and re-insert are not one transaction; a failed insert leaves an empty demo until the next run, and the job exits non-zero so the alert fires.
- Tests: Application (`FakeStore`): reset twice gives the same counts, today is always inside a cycle, earlier visitor rows are gone. Infrastructure: `DeleteDataAsync` removes only that user's rows. Fixture test: the JSON parses and respects the caps.

### 8. `reset-demo` entry point, image and compose
- `reset-demo`: scope as the demo user, call `ResetDemo`. `migrate` also seeds the demo when it has no cycles, so first deploy and `docker compose up` show data.
- The fixture is linked into `Budget.Jobs.csproj` as content. `.dockerignore` excludes `tests`, so add `!tests/e2e/fixtures/demo-seed.json` and a `COPY` for it in `src/Budget.Api/Dockerfile`.
- Verify by hand: `docker compose up -d --build`, `POST /auth/demo`, `GET /api/cycles/current` has categories and transactions; add a transaction, run `reset-demo`, it is gone.

### 9. Docs
- `docs/plans/m5-auth.md` status section; CLAUDE.md commands (`rollover`, `reset-demo`, user-secrets for Entra); design doc deltas (anti-forgery mechanism, `RealUsers`, `/auth/login` `404` when unconfigured); `.env.example` gains the optional `AUTH_ALLOWED_OIDS`.
- Manual steps: see the end of this document.

## Decisions taken

Reviewed on 2026-09-20. Decision 1 changed on review from a constant custom header to antiforgery tokens; decision 7 took its fallback (see Status).

1. **Anti-forgery is ASP.NET Core's antiforgery tokens** (changed on review, 2026-09-20; first draft was a constant custom header). The header relies only on the browser's CORS rules and silently stops protecting if a permissive CORS policy is ever added; the token does not. Cost is one `GET /auth/csrf` per app load and a refetch-and-retry in the M6 fetch wrapper, which the offline replay shares.
2. **The real `User` row is created by `migrate` from the allowlist**, keeping "the app never creates users". The alternative, creating it on first login, is a registration path by another name. `migrate` runs every deploy and is idempotent: it creates the demo row and one row per allowlisted `oid` only when missing. Login only looks up, so a sign-in needs both the allowlist entry and the row. Adding a person later is a config change plus a deploy.
3. **`/auth/login` is `404` when Entra is not configured** rather than failing startup, so compose and the test host run demo-only with no secrets.
4. **`rollover` lands now**, not M9: `reset-demo` needs the per-user job scope anyway, and the job is a few lines on top of it.
5. **`migrate` seeds an empty demo.** Otherwise the first deploy shows an empty demo until the nightly job.
6. **The callback is tested with a stub backchannel and a test signing key**, not a fake IdP container and not only a unit test: the allowlist is the security boundary, so it is exercised through the real middleware.
7. **`Microsoft.Identity.Web` as the design says.** If it fights the existing cookie scheme options, fall back to plain `AddOpenIdConnect` (same flow, fewer moving parts) and record it in the plan status.

## Verification

- `dotnet build -warnaserror`; `dotnet test` (Docker running); coverage gate in the Domain and Application csproj.
- `docker compose up -d --build` and the curl session in slice 8.
- After Ricky's app registration: `dotnet run --project src/Budget.Api` on `https://localhost:5001`, browse `/auth/login`, sign in, `GET /api/me` shows `isDemo: false`; a second Entra account (or an emptied allowlist) gets `403`.

## Manual steps (Ricky, once)

Nothing in the repo can do these, and nothing else in M5 waits on them. The one-time guide is `docs/tenant_app_registration_setup.md`: create the tenant, register the app, put the ids and the secret in user-secrets, and put your object id in `.env` so `migrate` creates your `User` row.

