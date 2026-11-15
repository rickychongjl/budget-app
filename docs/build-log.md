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
