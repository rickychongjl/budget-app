# Build log

Append-only. Each agent adds: what it built, assumptions the plan did not make for it, and anything that needs a human decision.

## L1 — Open sign-up (Google sign-in) · 15 Nov 2026 · PR #39 into `multi-user`

**Built.** Google replaces Entra on the existing OpenID Connect handler (`src/Budget.Api/Auth/OidcSignIn.cs`):
authorization code + PKCE against `https://accounts.google.com`, scopes `openid email profile`, `prompt=select_account`,
callback `/auth/callback`, entry `/auth/login`. Providers are a list (`OidcSignIn.All`), so Apple is one more entry with its own
login and callback paths. `GET /auth/options` returns `["demo","google"]`. `Login` provisions a `User` on first sign-in
(`ExternalId = google:<sub>`), re-reads after a lost race on the unique index, requires `email_verified`, and stores `Email`
(refreshed each sign-in, never logged). The display name on creation is the token's `name` (or `"Me"`). The allowlist
(`AllowedOids`, `Auth:AllowedOids`) and `migrate`'s `RealUsers` are removed; `migrate` ensures only the demo row. The sign-in
screen shows "Continue with Google" above the demo. MASTER 8, `AGENTS.md`, `docs/solution-design.md`, the infra parameters,
compose and `.env.example` are updated. `docs/google_sign_in_setup.md` replaces the Entra guide.

**Migration** `20261115090000_UserEmailAndProviderQualifiedExternalId`, hand-written because this workspace cannot restore
NuGet (CI's `MigrationTests` compares it with the model): adds `User.Email nvarchar(254) NULL` and widens `ExternalId` from 64 to
300 (Google allows a 255-character `sub`, plus the `google:` prefix; SQL Server rebuilds the unique filtered index around it).
Expand-only: the version before L1 still runs against it.

**Legacy adoption (`Auth:AdoptLegacyUserEmail`, `LegacyAccountAdoption`).** It applies to a Google sign-in when all of these hold:

- Google has verified the email.
- The email equals the setting, ignoring case and surrounding spaces.
- No row has that `google:<sub>` yet.
- Exactly one non-demo row still has a bare `ExternalId` (no `:`, an Entra oid).

That row's `ExternalId` is re-pointed at the Google subject and its email is set; its id and data are untouched. Otherwise it is
an ordinary first sign-in. Empty switches it off. Idempotent: after the move the subject finds the row directly.

**Assumptions the plan did not make for me.**
- The plan said the re-link is "run by `migrate` from config". It runs at sign-in instead, because the Google subject is not
  known until the first Google sign-in, and keying it on the verified email means Ricky never has to look up his `sub`.
- An unverified email is refused for every sign-in, not only the first (`auth.email-unverified`).
- Both `Google:ClientId` and `Google:ClientSecret` must be set for Google to be offered, so a half-configured deployment never
  draws a button that cannot finish.
- New users still get `Australia/Sydney` and `AUD`; asking for the device time zone is L2 (audit A5).
- No account linking: the same person through Google and later Apple is two accounts. Revisit when Apple lands (L1b).
- The Google button uses Google's mark, wording and light/dark colours, but our typeface (Inter 600) rather than Google's Roboto
  Medium, because the app self-hosts one font. Google's guidelines name Roboto. **Ricky to decide:** keep Inter, or self-host a
  Roboto Medium subset just for this button.
- With Google offered, "Try the demo" moves from the primary to the secondary button and sits under the Google button: sign-up is
  now the main way in. Without Google it is the primary, as before.

**Not verified here.** The .NET build and tests run only in CI (no NuGet, no Docker in this workspace); Domain and Application were
compiled locally against stand-ins. The bicep was not compiled (`az` is not available here); run `az bicep build` and `what-if`
before deploying. The sign-in screen was not checked in a browser against MASTER 14's device list.

**What Ricky must do.**
1. Google Cloud: consent screen (External; publish it when strangers should get in, since in Testing only listed test users can
   sign in) and OAuth web clients per `docs/google_sign_in_setup.md`. The local client's redirect URIs are
   `https://localhost:5001/auth/callback` and `http://localhost:8080/auth/callback`; production's is `https://tightarse.app/auth/callback`.
2. Locally (repo root):
   `dotnet user-secrets set "Google:ClientId" "47567868385-9h2n07u3ehvbactro1ctbr51bkffcit3.apps.googleusercontent.com" --project src/Budget.Api`,
   `dotnet user-secrets set "Google:ClientSecret" "<local secret>" --project src/Budget.Api`, and optionally
   `dotnet user-secrets set "Auth:AdoptLegacyUserEmail" "<your Google address>" --project src/Budget.Api`. For compose, set
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. Remove the old `Entra:*` and `Auth:AllowedOids` user-secrets.
3. Production, before the `multi-user` → `main` merge deploys this: set `$env:GOOGLE_CLIENT_ID`, `$env:GOOGLE_CLIENT_SECRET` (the
   production client) and `$env:AUTH_ADOPT_LEGACY_USER_EMAIL` (your Google address), then run `what-if` and `create` with
   `prod.bicepparam`. `deploy.yml` only moves the image, so without this step production stays demo-only and the old Entra env vars
   stay on the Container App, unused. Then sign in once with Google and check your data is there. After that the adopt email can
   be left empty.
4. Optionally delete the Entra app registration once production is on Google.

## L2 — New-user first run · 15 Nov 2026 · branch `feat/l2-first-run` into `multi-user`

**Built.** Onboarding now opens, for a real user with no cycle at all, on a "First, about you" step before the cycle form
(`features/onboarding/Onboarding.tsx`, `AboutYou`). It suggests the device's IANA zone
(`Intl.DateTimeFormat().resolvedOptions().timeZone`, read once) and the display name the account was created with (Google's
`name`), both editable, and saves both with one `PATCH /api/me`. It is a direct endpoint write: disabled offline with "Saving this
needs a connection." On success the session's `['me']` query is set from the PATCH answer at once and then invalidated, so the
`GET /api/me` the service worker caches is refreshed too. The cycle form (`Start`) is keyed on `me.timeZone`, so its suggested
start date ("today") is the saved zone's: TanStack notifies observers a tick after `setQueryData`, and without the key the form
mounted with the old zone's date (the unit test caught this). Every other "today" already reads `todayIn(me.timeZone)` from the
session, so it follows once the query updates.

**Time-zone picker** (`TimeZoneField.tsx`, `timeZones.ts`): a native select laid out like `ui/Field`. An "Australia" group first,
west to east by city (Perth, Darwin, Adelaide, Brisbane, Sydney, Melbourne, Hobart, Lord Howe), then "Everywhere else": every zone
from `Intl.supportedValuesOf('timeZone')`, sorted, without repeating the Australian ones, plus the detected and saved zones if the
browser does not list them (older names such as `Asia/Calcutta`). Every value is an IANA id, which is what the server's
`TimeZoneInfo.TryFindSystemTimeZoneById` check accepts on Linux. If the browser's list is newer than the server's tz database
and the server answers `user.timezone.unknown`, the message appears at the zone field. A device that reports no zone (or
`Etc/Unknown`) starts from the stored zone.

**Who skips it.** The demo (its profile is read-only, `demo.profile.readonly`), and anyone who already has a cycle (a draft or a
confirmed one), which includes everyone who signed up before this.

**Server.** `Me.cs` needed no change: `PATCH /api/me` already takes both fields and validates the zone. Added an Application test
that the first-run request (name and an Australian zone together) saves once.

**Assumptions the plan did not make for me.**
- The step is not remembered across a reload: someone who saves it and reloads before creating the first cycle is asked again,
  with their saved name and the device's zone suggested. Remembering it would need a server flag and a migration for one tap.
- Both fields are sent even if unchanged, because the stored ones came from the token and a default, not from the user.
- The step is shown alone (no step number), so the existing "1. 2. 3." headings and the Playwright spec's flow are unchanged.
- Empty states had their second look: Home's "No budget yet. Set up your first cycle." and Cycles' "No cycles yet." say nothing
  that only fits one known user, so they are unchanged.
- The select is the same kind Settings uses (Settings still lists raw IANA ids with no Australian group). Settings is outside
  L2's Owns, so it was not changed; it could import `TimeZoneField` later.
- `User.ChangeTimeZone` also accepts a Windows id (`AUS Eastern Standard Time`) through a hand-made API call, which the web's
  `todayIn` would treat as UTC. The UI never sends one. A validator rule that only IANA ids are accepted is possible hardening
  for L12.

**Departure from the plan.** "A Playwright onboarding spec covers it": `07-onboarding.spec.ts` runs as the shared demo, which
skips this step, so the spec now asserts that the demo is not asked. A Perth user seeing Perth's "today" is covered by the web
unit test (3pm UTC on the 19th: Sydney's 20th, Perth's 19th) until a second user can sign in under Playwright (audit B7, L13).

**Checked.** Web lint, tests (389) and build pass locally. The step was checked in headless Chrome against a stub API: light and
dark at 360 and 430 wide, landscape, 200% zoom, and a device in Perth and in London (detected and pre-selected). Not checked: a
real phone (iOS's select wheel with about 400 entries, safe areas in standalone mode). The .NET test runs only in CI.

**What Ricky must do.** Nothing.

## L3 — Export my data · 15 Nov 2026 · PR into `multi-user`

**Built.** `GET /api/me/export` returns `application/zip` with `Content-Disposition: attachment; filename="tightarse-export-YYYY-MM-DD.zip"`
(the date is the user's "today" in their time zone) and `Cache-Control: no-store`. The ZIP holds `profile.csv`, `cycles.csv`,
`categories.csv` (one row per cycle-category snapshot), `transactions.csv` and `export.json` (everything, nested by cycle, with ids).
Application: `src/Budget.Application/Export/` (`ExportData` use case, `ExportCsv` cell encoding, `ExportArchive` ZIP writer).
One new read method, `ITransactionRepository.ListAllAsync` (oldest first, untracked); everything else uses existing repository
methods, so the tenant filter does the isolation. The route is in `TenantIsolationTests.TakesNoIds` with a two-user test that
checks ids and values in every file both ways. Settings → Account has "Export my data" (secondary button, Lucide `download`),
disabled offline with "Needs a connection.", a spinner while pending, a toast when done or refused.

**Formats.** Dates `YYYY-MM-DD`; timestamps ISO 8601 UTC (`2026-11-15T01:02:03Z` in CSV, `+00:00` in JSON); amounts plain invariant
decimals with two places (`-2.50`); CSVs UTF-8 with BOM, CRLF rows, RFC 4180 quoting. Text cells starting with `=`, `+`, `-`, `@`,
tab or CR get a leading `'`; amounts, dates and enum values are never guarded, so a reversal stays a number. JSON values are
exactly as stored (no guard), camelCase, enums as strings.

**Assumptions the plan did not make for me.**
- The archive is built in a `MemoryStream` and then streamed, rather than written straight into the response: `ZipArchive`
  writes synchronously, which Kestrel refuses, and buffering means a failure is a problem response, not a truncated file. Rows
  are still written row by row into each entry, never as one big string. A user has at most a few thousand rows.
- CSVs carry no ids (they are for people; rows join on cycle start date and category name). `export.json` carries every id.
- Category type is written as `Debit` / `Credit` (the data model's words) in both CSV and JSON, not the UI's Spending / Income.
- A transaction's category name is the one from its own cycle's snapshot, so a later rename does not rewrite history.
- Rate limit: a new `export` policy, 5 a minute per client address (`RateLimiting:ExportPermitLimit`), fixed window, on top of the
  global limit. Per address, not per user, because the limiter runs before authentication, like the `auth` policy.
- The button fetches through `api.download` (a new helper in `api/client.ts`) and saves via an object URL, instead of a plain
  link, so a 429 or a lost session is a toast and a 401 goes back to sign-in, rather than an error saved as a file.
- The demo user can export like anyone (it is a normal user); its export is the shared demo data.

**Not verified here.** .NET build and tests run only in CI (no NuGet or Docker here). The export code and Domain were compiled
locally against the SDK alone and run through a harness that printed every file; the xUnit tests were not run locally. The
button was not checked in a browser against MASTER 14 (themes, widths, text size, standalone mode). Whether an iPhone in
standalone (home-screen) mode saves the ZIP from an object URL cleanly needs a check on a real device. Opening the CSVs in
Excel and Google Sheets is the plan's "done when" and needs a person.

**What Ricky must do.** Download an export from Settings on a phone and a desktop, open the CSVs in Excel and Google Sheets,
and check the iPhone home-screen app saves the file.

## Fix — deterministic oldest-demo-user repository test · 15 Nov 2026 · PR into `multi-user`

**Problem.** `RepositoryTests.The_demo_user_is_the_oldest_user_flagged_as_demo` failed intermittently (twice on #40). All
Infrastructure tests share one database. The test made two demo users at `TestData.Now` and a day later and expected
`GetDemoAsync` (oldest `CreatedAt` first) to return the first; since L1, `Legacy_users_are_the_non_demo_rows_whose_external_id_is_a_bare_oid`
also leaves a demo user at `TestData.Now`, so the oldest was a tie and SQL Server picked either.

**Changed.** Test only: the pair is now dated `TestData.Now.AddYears(-10)` and a day later, and the comment says why. Searched
every test project for demo rows: in this database the only others are the legacy test (`TestData.Now`) and the reset-demo job
tests (`DemoUser.EnsureExistsAsync` with the real clock, and only when no demo row exists yet); Api tests use their own container
and the real clock and assert only `isDemo`, never which demo row. Nothing else is dated before 2026, so there is no new tie.

**Decision.** `UserRepository.GetDemoAsync` is unchanged. Production has exactly one demo row (`migrate` ensures it), so adding
`ThenBy(Id)` would only make an impossible tie pick an arbitrary-but-stable GUID, not a meaningful one.

**What Ricky must do.** Nothing.

## L4 — Delete my account · 15 Nov 2026 · PR into `multi-user`

**Built.** `DELETE /api/me` with body `{ "confirm": "DELETE" }` (under `/api`, so antiforgery-checked). Application:
`Users/DeleteAccount.cs` refuses anything but the typed word (`422 account.delete.unconfirmed`; surrounding spaces forgiven,
case not), refuses the demo (`422 demo.account.undeletable`), then calls `IBilling.CancelForDeletionAsync` (new port in
`Application/Billing/`, registered as the no-op `NoBilling` in Infrastructure until a store integration replaces it), then
`IUserRepository.DeleteAccountAsync`. That runs `DeleteDataAsync` and deletes the `User` row in one database transaction inside
the EF execution strategy, so a failure leaves the account whole and a retry starts again from the top. It refuses unless the
scope is running as that user, because the `User` table has no query filter. An account that is already gone returns
`AlreadyGone` and the endpoint still answers 204 and clears the session cookie. Log lines carry no ids.
Settings → Account: "Delete account" (destructive button) opens a Sheet that says what goes, offers "Export my data first",
and enables Delete only once `DELETE` is typed; disabled offline with "needs a connection". On success the device is cleared
the way sign-out clears it, without posting `/auth/logout` (the server already ended the session), and the offline outbox is
dropped too. The demo sees "The demo is shared, so it can't be deleted." instead of the button.

**Tests.** Application (order: billing, data, user; confirmation; demo; already gone; failure part-way then retry);
Infrastructure (every table with a `UserId`, read from the EF model so a tenant table added later and forgotten fails, holds no
row for the deleted user; bystander untouched; rollback when the `User` delete fails; refusing another user's account); API
(204 + cookie cleared, 422s, demo, 400 without antiforgery, 401 signed out, repeat delete); `TenantIsolationTests` lists the
route with an attack; `GoogleSignInTests` proves the same Google account signing in again gets a fresh empty account. Web:
the sheet and the local-only sign-out.

**Outside the Owns line.** `features/auth/SessionGate.tsx` and `useSession.ts` (sign-out takes `{ accountDeleted }`), and
`api/client.ts` (`api.delete` takes an optional body). `BudgetDbContext.CurrentUserId` became `internal` so the repository can
apply the same rule to the `User` row.

**Assumptions.** The confirmation word is `DELETE` in capitals. Deleting also drops queued offline changes on that device.
Request logs and Application Insights telemetry are not touched by deletion (for L12 and the privacy policy).
The `Subscription` table from L5 must also be in `DeleteDataAsync`; the Infrastructure test enumerates tenant tables from the
model, so whichever of L4 / L5 merges second is held to it.

**Not verified here.** .NET builds and tests run in CI only. The sheet was not checked in a browser against MASTER 14.

**What Ricky must do.** Nothing before merge. After promotion, delete a throwaway Google account end to end once.

## L10 — Privacy policy and terms (drafts) · 15 Nov 2026 · branch `docs/l10-legal`

**Built.** `docs/legal/privacy.md` and `docs/legal/terms.md`, plain-English drafts in short headed sections for reading on a
phone. Both open with the "DRAFT — not legal advice" line. No code changed. Every claim was checked against the code on
`multi-user` at `ed574fd` (after L1). `privacy.md` ends with a "Claims and where they are true" table (claim, file or setting,
status) and a list of eight things in the code that cut against the policy. Remove both before publishing.

**What the code check found** (details in the table and list at the end of `privacy.md`):
- Region: `main.bicep` uses `resourceGroup().location`, and the runbook creates the group in `australiaeast`. The region is not
  in code, so confirm it on the deployed resources.
- Backups: `sql.bicep` sets no retention policy, so Azure's default 7-day point-in-time restore applies (Basic allows 1 to 7).
  Backup storage is `Local`, so backups stay in the region. Azure keeps the full backup that a restore point depends on, so
  deleted data can stay in backups past 7 days. The policy says "normally within 7 days and at most about two weeks".
- Logs: Log Analytics `retentionInDays: 30`, and Application Insights is workspace-based, so request records last 30 days. They
  are not deleted when an account is.
- IP addresses: Application Insights keeps its default IP masking, so the IP is stored as `0.0.0.0` but city, state and country
  are derived from it first. The policy discloses this. Behind Cloudflare and `UseForwardedHeaders` the location could be the
  user's real one, so check it.
- Cookies: `budget.session` (30 days sliding, 4 hours for the demo), `budget.csrf` (browser session), and the OpenID Connect
  handler's short-lived correlation and nonce cookies. Nothing else in the app. Whether Cloudflare sets a cookie is not in the repo.
- On the device: IndexedDB `budget` (cached answers and the outbox) and the service worker's `session` cache (`/api/me`). Sign-out
  clears the cache, but the outbox stays until it syncs or another account signs in. `localStorage` preferences (theme,
  favourite and last-used category ids, chart filter, install hint) survive sign-out. If a session simply expires, the copy stays.
- The app's own log calls carry no personal data. EF Core logs SQL text at Information without values. An unhandled exception's
  message could in theory echo a value.
- The SQL firewall's `AllowAllWindowsAzureIps` rule admits any Azure-hosted caller. The policy says only that the database needs a
  password, not that only the app can reach it.

**Decisions taken (conservative, for Ricky to overrule).**
- Minimum age is **18** in both documents. It is the safest choice: no question of a minor's capacity to contract or to subscribe,
  and it keeps clear of the OAIC's Children's Online Privacy Code, which is being developed for services likely to be used by
  under-18s. Google accounts are open to 13-year-olds in Australia, and nothing in the app checks age.
- Export and delete are described as Settings features, which is true only after **L3 and L4**. If the policy is published
  before then, say instead "email support@tightarse.app and we'll export or delete your data within 30 days", and Ricky must
  do it by hand.
- Premium, store billing and Sign in with Apple are all marked "planned". Billing, cancellation and refunds are left to the
  Apple and Google terms, and the Australian Consumer Law guarantees are kept.
- Liability: indirect loss is excluded, and otherwise liability is capped at the past 12 months' fees, all "to the extent
  permitted by law". The ACL guarantees, fraud and deliberate wrongdoing are carved out. A lawyer should check the cap against
  the unfair contract terms rules, which carry penalties since November 2023.
- Notice periods: 14 days for significant changes to the terms, 30 days before the service closes. Requests are answered within
  30 days (APP 12 asks for a "reasonable period"; the OAIC treats 30 days as the usual guide). The policy commits to telling users about a serious breach even if the business is exempt.
- If a backup is ever restored, the policy commits to deleting again any account deleted after that backup was made. No code does
  this; it is a manual step.
- The terms include a short "App Store and Google Play" section for when the phone apps ship. Apple requires either its
  Standard EULA or a custom EULA with its minimum terms. Pick one when L1b or L6 starts.

**Open questions for Ricky.**
1. **Legal name** for `[OPERATOR LEGAL NAME]`, and the **effective date**.
2. **ABN**: do you have one, and should it appear? An ABN is optional for a sole trader, but it is useful once Premium
   earns money.
3. **Business name**: trading as "Tight Arse" under anything other than your own name generally means registering it as a
   business name with ASIC. Also consider whether app store review will accept the name.
4. **Refunds**: is it store refunds only, or will you also refund directly in some cases (for example the unused part of a year
   if you close the service)? Terms "Ending" has a placeholder.
5. **Minimum age**: keep 18, or allow 16 and 17 with a parent's permission?
6. **Cloudflare cookies and logs**: is Bot Fight Mode or any feature on that sets `__cf_bm` or similar? Fill in or delete the
   bracketed line under Cookies.
7. **Support mailbox**: does `support@tightarse.app` exist, which provider hosts it, and how long are emails kept? The privacy
   policy has a placeholder.
8. **Application Insights location**: run `requests | take 20 | project client_City, client_IP` in App Insights. If it shows
   users' cities and you would rather not keep them, a span processor that drops `client.address` removes them (a code change,
   outside L10).
9. **Commitments with no code behind them**: not selling data, the 30-day reply, breach notification, re-deleting after a
   restore. Are you happy to be held to them?
10. A lawyer's review before taking money, as the plan says.

**What Ricky must do by hand.** Answer the questions above, fill in the placeholders, delete the claims table and the flags
from `privacy.md`, and approve both documents (launch plan section 5). L9 then publishes them at `/privacy` and `/terms`. Once
they are live: add the privacy policy and home page URLs to the Google OAuth consent screen (required before publishing it to
External). When the phone apps ship, also fill in Apple's App Privacy details and Google Play's Data safety form from the
same facts.

**Not verified here.** The deployed Azure region, the retention settings in the portal, and Cloudflare's dashboard settings are
not in the repo.

## L5 — Plans and entitlements · 15 Nov 2026 · PR into `multi-user`

**Built.** Domain `Subscriptions/`: `Plans` is the one class holding D3's numbers (Free: 6 categories per cycle, the most
recent past cycle in reports, no trend chart; Premium: no limits; A$3.99/month, A$29.99/year, 14-day trial; 3-day grace),
`Subscription` (tenant row: `Source` `app_store`/`google_play`/`manual`, `ExternalId`, `Status`, `Plan`, `CurrentPeriodEnd`,
`TrialEnd`, `CancelAtPeriodEnd`; stored as text codes with check constraints) and `Entitlement.Resolve` (demo → Premium,
complimentary email → Premium, a subscription that still `GrantsPremium` → Premium, otherwise Free). Application
`Subscriptions/`: `Entitlements` (per request, never stored), `PlanSettings`, `ISubscriptionRepository`, `PlanCatalogueDto`.
Gates: `CycleCategories.AddAsync` refuses the 7th category on Free (`422 plan.limit.categories`); `Reports.ListAsync` trims
`GET /api/reports/cycles` to the cycles Free may see. Downgrade never deletes: over-limit cycles keep every category, older
cycles stay in the database, `GET /api/cycles` and the export. `GET /api/me` now carries `plan`, `planSource` and `limits`.
New anonymous `GET /api/plans` returns the catalogue from `Plans` for the public pricing page (L9 reads it there).
Migration `SubscriptionTable` (expand only). `Subscription` is in `UserRepository.DeleteDataAsync`. Rebased onto L4: account
deletion removes `Subscription` rows, and L4's deletion tests at all three tiers now seed and check one. The check
constraints compare in `Latin1_General_100_BIN2`, because the database's default collation ignores case and `Active`
would otherwise be stored and then fail to read back. Web: `features/plans/`
(Plan section in Settings, `PremiumNote`), category limit note and lock in Categories, locked trend on Cycles for Free.

**Departures and choices.**
- Store sources (`app_store`, `google_play`, `manual`) instead of `stripe`, per section 6 (paid product is a native app).
- `Plans:ComplimentaryPremiumEmails` (comma-separated, matched to the verified `User.Email`) gives an account Premium without
  a subscription, so Ricky's own account, which has more than six categories and months of history, is not cut down to Free
  at launch. This needed `infra/` (a Bicep parameter, the Container App env var, `PLANS_COMPLIMENTARY_PREMIUM_EMAILS` in
  `prod.bicepparam`), outside the Owns line. Empty by default; no address is committed.
- The demo is Premium (it shows every feature; `DemoCaps` still bounds it).
- No purchase UI: "Premium is coming soon in the app".

**Not verified here.** .NET builds and tests (including the hand-written migration against `MigrationTests`) run in CI only.
UI not checked in a browser against MASTER 14.

**What Ricky must do.** Before promoting to `main`, set `PLANS_COMPLIMENTARY_PREMIUM_EMAILS` (deploy env) to his Google
address, or his own account becomes Free (it keeps its data, but can add no category past six and the Cycles page shows only
the latest past cycle). Confirm the Free/Premium split.

Work started by the L5 task agent; finished by the orchestrator after the agent stopped on a usage limit.

## L9 — Public pages · 15 Nov 2026 · PR into `multi-user`

**Built.** Signed-out pages inside the SPA (decision D4), in a new `src/web/src/features/public/`:
- `/` signed out: the landing page (name, one-line pitch, three feature cards, "Start free", "Try the demo", a link to
  pricing). The note under the buttons says plainly that the demo is one shared account everyone can see and that it resets
  every night. With no connection at all, `/` still shows it, with the demo button off and "Signing in and the demo need a
  connection."
- `/pricing`: Free and Premium cards and a comparison table, every number worked out from `plans.json`, a copy of
  `GET /api/plans` (L5's `Plans`). "Premium is coming with the mobile apps ... It cannot be bought yet."
- `/privacy` and `/terms`: the L10 drafts (#40 had merged), drawn by a small Markdown renderer (`legalText.ts` parses,
  `Markdown.tsx` draws React elements, never HTML strings), including the "DRAFT — not legal advice" line at the top.
- Per-route `document.title`, `description` and Open Graph tags (`usePageMeta`), put back when the page goes.
Routing: `App.tsx` now has the router outermost. `/pricing`, `/privacy` and `/terms` sit outside `SessionGate`, so they render
for anyone, signed in or out, without asking the server, and offline from the precached shell (the service worker already
serves `index.html` for any navigation outside `/api`, `/auth`, `/health`, so `vite.config.ts` is unchanged). Everything else
goes through `SessionGate` as before; signed out, `/` is the landing page and any other path is the existing sign-in screen
(`/signin?error=...` unchanged).

**Choices the plan left open.**
- The pages read copies kept in the SPA (`plans.json`, `legal/privacy.md`, `legal/terms.md`) instead of fetching, because the
  Docker image builds the SPA from `src/web` alone (docs/ is in `.dockerignore`) and the pages must work offline.
  `tests/Budget.Api.Tests/PublicPagesTests.cs` keeps them honest in CI: `plans.json` must equal what `GET /api/plans` serves,
  and each legal copy must equal `docs/legal/<file>` up to the "Claims and where they are true" heading. That section (the
  claims table and the list of things in the code that cut against the policy, including the SQL firewall rule) is Ricky's
  working notes, so it is left out of the copy and never ships in the bundle. **After editing `docs/legal`, copy the text
  above that heading into `src/web/src/features/public/legal/`**, or CI fails.
- "Start free" goes to `/signin`, where Google's own "Continue with Google" button is (MASTER 8), rather than putting a second,
  differently worded Google button on the landing page. One extra tap.
- No screenshots on the landing page (the plan's section 3 mentions them; the brief did not). Add them once the UI settles.
- Open Graph tags are set from script, so link previews from crawlers that run no JavaScript still see `index.html`'s
  defaults. A static page or server-side tags would be needed for rich previews (the D4 trade-off).
- Legal text and the pages are in the entry chunk (about 25 KB more); fine for now.

**Outside the Owns line.** `features/auth/auth.test.tsx` and `features/onboarding/onboarding.test.tsx` now wrap
`SessionGate` in a router (it reads the path); `auth.test.tsx` starts at `/signin` instead of `/`.

**Not verified here.** The C# test runs in CI only. Not checked in a browser against MASTER 14 (themes, 360/430px, 200% text,
standalone mode); the pages use only tokens and the existing button styles.

**What Ricky must do.** Fill in the legal placeholders and approve the drafts (L10), then re-copy them as above. Once live, add
`/privacy` and `/` to the Google OAuth consent screen.

## L12 — Security pass · 15 Nov 2026 · PR into `multi-user`

**Built.** `docs/security-review.md`: every route added by L1 to L9 checked for auth, antiforgery, rate limit and tenant
isolation, plus open redirects on sign-in, logs, CSP, demo handling, dependencies and the privacy flags from L10. Fifteen
findings: two fixed here, four open for Ricky (S2, S11, S12, S13), the rest OK.

**Fixed (small, with tests).**
- **S4, time zones (L2's note).** `User.ChangeTimeZone` now accepts only IANA ids (`TimeZoneInfo.HasIanaId`), so a Windows id
  sent by hand is refused with `user.timezone.unknown`. The constructor still checks only that the zone exists, because EF
  materialises stored rows through it and an existing row must always load. Tests: `UserTests`, `MeTests`.
- **S10, device copy after a session ends (L10 flag 4).** Any 401 now forgets the session the way sign-out does: cached reads
  in IndexedDB, in-memory queries, the service worker's `/api/me` and the antiforgery token. The outbox is kept, as on sign-out.
  Test: `auth.test.tsx`. (`features/auth/SessionGate.tsx` is outside L12's Owns line beyond "small hardening fixes"; the change
  only moves sign-out's clearing into a shared `forget` and calls it on 401.)

**docs/legal corrected for factual accuracy** (as asked; wording and tone otherwise untouched; the SPA copies re-synced):
- privacy, "The demo account": added "The demo account can't be deleted." (L4 refuses it.)
- privacy, "On your device": added what happens when a session ends on its own (S10) and when the account is deleted (L4 clears
  the copy and unsent changes on that device).
- privacy, "How long we keep it": deletion also removes plan records (L5's `Subscription` in `DeleteDataAsync`) and happens all
  together (one transaction); request records are not deleted early by account deletion (S11).
- privacy, "Your choices and rights": export is one ZIP with CSV files of profile, cycles, categories and transactions plus one
  JSON file, and needs a connection (L3); deletion is confirmed by typing DELETE and signs you out (L4).
- privacy, claims table and flag 4: L3/L4 rows now "True today", flag 4 marked resolved for the online case.
- terms, "If you stop paying": "becomes read-only" was wrong for L5. Over-limit categories stay editable and removable (only
  adding is blocked), and older past cycles are left off the Cycles page but kept in the account and the export.
- Backups: what the drafts say still matches the code (L3/L4 do not touch backups); no change.

**Open for Ricky** (details in `docs/security-review.md` section 3): S2 no daily cap on new accounts per address; S11 request
records outlive deletion by up to 30 days; S12 `AllowAllWindowsAzureIps` on the SQL server; S13 approximate location in
Application Insights.

**Not verified here.** .NET tests run in CI only. `HasIanaId` behaviour was checked locally against the .NET 10 runtime
(`Australia/Sydney` true, `AUS Eastern Standard Time` false). NuGet vulnerability audit runs only in CI.
