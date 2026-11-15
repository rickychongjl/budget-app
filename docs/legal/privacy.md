DRAFT — not legal advice; to be reviewed by Ricky (and ideally a lawyer) before publication.

# Tight Arse privacy policy

**Effective:** [EFFECTIVE DATE]

Tight Arse is a personal budgeting app that works in 30-day cycles. It runs on the web and can be installed on your phone's home screen. Android and iPhone apps are planned.

It is run by [OPERATOR LEGAL NAME] ([ABN IF ANY]), an individual in Queensland, Australia. "We", "us" and "our" mean that person. You can reach us at **support@tightarse.app**.

This policy explains what we collect, why, where it is kept, who else handles it, and what you can do about it.

## The short version

- You sign in with Google. We never see or store a password.
- We keep your email, your name, your time zone and the budget figures you type in.
- Your data is stored in Microsoft Azure's Australia East region (Sydney).
- No bank connections, no ads, no third-party analytics, and we don't sell your data.
- The only cookies are the ones needed to keep you signed in and to protect your account.
- You can export your data, and deleting your account deletes it straight away.

## The standard we follow

We follow the Australian Privacy Principles in the Privacy Act 1988 (Cth). A small business may be exempt from that Act. We follow these principles anyway, and this policy is written to meet them.

## What we collect

**From Google, when you sign in**

- Your Google account ID, which tells us which account is yours.
- Your name. We use it as your display name when your account is created. You can change it.
- Your email address. We refresh it each time you sign in.
- Whether Google has verified your email. We need it to be verified, but we don't store this.

Google may send other profile details as part of sign-in (such as your profile picture). We don't keep them. We don't keep any Google sign-in tokens either.

**From you, as you use the app**

- Your time zone. It decides what "today" is for your budget.
- Your budget: cycles and their start dates, categories (name, icon, colour, order), budget amounts, opening and closing balances.
- Your transactions: amount, date, category, and an optional note.
- When things were created or changed.

We also store your currency (Australian dollars) and the date your account was created.

Please don't put sensitive information in notes, such as health details or bank card numbers. A budget doesn't need them.

**Automatically, when you use the app**

- Our hosting records requests to the app for up to 30 days, to keep it running and fix faults. This includes the time, the page or function used, how long it took and whether it worked.
- Your IP address is used to work out an approximate location (city, state, country) and is then discarded. Only the approximate location is kept. Your IP address is also used briefly, in memory, to stop anyone sending too many requests. It is not stored by the app.
- These records do not include your email or your budget figures.

**What we don't collect**

- We don't connect to your bank or read your bank statements.
- We don't collect card or payment details. Payments, when Premium launches, are handled by Apple or Google.
- We don't use advertising or third-party analytics, and we don't track you across other websites or apps.

## Why we use it

- To sign you in and keep your account separate from everyone else's.
- To store your budget and show it back to you on your devices.
- To work out your current cycle in your time zone.
- To reply when you contact us, and to tell you about important changes to your account or these documents.
- To keep the app secure and working, and to fix problems.
- When Premium launches (planned): to know which plan you are on.

We don't use your data for marketing, and we don't sell or rent it to anyone.

## The demo account

The "Try the demo" button opens one shared demo account that anyone can use without signing in.

- **Anything you type in the demo can be seen by other visitors.** Don't enter real or personal information there.
- The demo is wiped and reset every night, and anything typed there is deleted.
- A demo session ends after four hours.

## On your device

So the app works with no signal, it keeps a copy of your budget on your device. This copy includes your budget figures, transactions and notes, and any changes you made offline that haven't been sent yet.

- **When you sign out**, the copy of your budget is removed from that device. Changes that haven't been sent yet are kept until you sign back in and they are sent, or until someone else signs in on that device, when they are deleted.
- **If you just close the app**, the copy stays so you can open it offline later.
- The device also remembers a few preferences that never leave it: light or dark theme, your favourite and last-used categories, your chart filter, and whether you dismissed the install hint. These stay after you sign out.

On a shared or borrowed device, sign out when you're done.

## Cookies

We only use cookies that are strictly necessary for the app to work. None are for advertising or analytics.

| Cookie | What it does | How long |
|---|---|---|
| `budget.session` | Keeps you signed in. Holds only your account number in the app, encrypted. | 30 days from your last visit (4 hours for the demo) |
| `budget.csrf` | Protects your account from forged requests. | Until you close the browser |
| `.AspNetCore.Correlation.*` and `.AspNetCore.OpenIdConnect.Nonce.*` | Protect the Google sign-in step. | Deleted when sign-in finishes; at most an hour |

Our network provider, Cloudflare, may set its own security cookie to tell people apart from automated attacks. [Ricky to confirm whether any Cloudflare cookie is set.]

## Where your data is stored

Your account and budget are stored in Microsoft Azure's **Australia East** region (Sydney). This includes the database, its backups, and our request records.

Data is encrypted while it travels between your device and us, and while it is stored.

## Who else handles your data

We use a few service providers. They handle your data only to provide their service to us.

| Provider | What they do | What they see |
|---|---|---|
| Microsoft (Azure) | Hosts the app, the database, backups and request records, in Australia East | Everything we store |
| Cloudflare | Sits in front of the app to protect it and deliver it quickly | Your requests as they pass through, including your IP address |
| Google | Lets you sign in with your Google account | That you signed in to Tight Arse |
| Apple (planned) | Sign in with Apple, and in-app purchases on iPhone | That you signed in; your purchases |
| Google Play (planned) | In-app purchases on Android | Your purchases |

Microsoft keeps your stored data in Australia. Cloudflare, Google and Apple are based in the United States and operate worldwide, so the information they see may be handled outside Australia, including in the United States. Each has its own privacy policy for the data it handles as part of your account with them.

We may also share information if the law requires it, for example under a court order.

## How long we keep it

- **While you have an account:** we keep your data so the app can show your history.
- **When you delete your account:** your account and every budget, category, cycle and transaction are deleted from the live database straight away. This cannot be undone.
- **Backups:** the database is backed up automatically so it can be restored to any moment in the last 7 days. Deleted data stays in these backups until they expire, normally within 7 days and at most about two weeks. If we ever restore a backup, we will delete again any account that was deleted after that backup was made.
- **Request records:** kept for 30 days, then deleted. They don't contain your email or budget figures.
- **Emails you send us:** kept as long as we need them to help you. [Ricky to confirm.]

## Your choices and rights

- **See and correct your data.** Everything you type is in the app, and you can edit it there. Change your display name and time zone in Settings. Your email comes from Google; change it there and we'll pick it up next time you sign in.
- **Export it.** In Settings you can download all your data as CSV files (they open in Excel or Google Sheets) and as one JSON file.
- **Delete it.** In Settings you can delete your account. You type a confirmation, and everything is deleted immediately. If you sign in again with the same Google account, you start with a new, empty account.
- **Ask us.** Email support@tightarse.app to ask what we hold about you, or for help with any of the above. We will reply within 30 days.

We don't charge for any of this.

## Security

- No passwords: Google handles sign-in.
- Your session cookie can't be read by scripts on the page and is only sent over a secure connection.
- Every account's data is kept separate from every other account's, and the app is tested so one user can't reach another's data.
- The database needs a password to access and is encrypted at rest.

No system is perfectly secure. If a breach affects your information and could cause you serious harm, we will tell you as soon as we can, and tell the Office of the Australian Information Commissioner where the law requires it.

## Age

You need to be 18 or older to create an account. [Open question for Ricky: see the build log.]

## If you live outside Australia

Tight Arse is run from Australia and is built for people in Australia: amounts are in Australian dollars. If you use it from another country, your data is stored in Australia and handled as this policy describes. The laws where you live may give you other rights. Email us and we will help where we can.

## Changes to this policy

If we change this policy, we will update the date at the top. If a change is significant, we will tell you in the app or by email before it takes effect.

## Questions and complaints

Email **support@tightarse.app**. We will reply within 30 days.

If you are not happy with our answer, you may be able to complain to the Office of the Australian Information Commissioner (OAIC) at oaic.gov.au.

---

## Claims and where they are true

For Ricky's review; remove this section before publishing. "L-n" is the launch-plan task that makes a claim true. Paths are in the `budget-app` repo.

| Claim | File or setting that makes it true | Status |
|---|---|---|
| Sign-in is Google only; no passwords | `src/Budget.Api/Auth/OidcSignIn.cs` (`All = [Google]`), `AuthEndpoints.cs`; no password store anywhere | True today |
| Sign in with Apple | L1b (parked) | Planned; true after L1b |
| From Google we receive ID, name, email, verified flag | `OidcSignIn.cs` `OnTokenValidated` reads `sub`, `email`, `email_verified`, `name`; scopes `openid email profile` | True today |
| Verified flag is checked, not stored | `src/Budget.Application/Users/Login.cs` refuses unverified; `User` has no such column | True today |
| Other profile details and Google tokens are not kept | `OidcSignIn.cs`: `SaveTokens = false`, `GetClaimsFromUserInfoEndpoint = false`; session claim is only the app's user id | True today |
| Name used as display name at creation; editable | `Login.cs` `DisplayName(...)`; `PATCH /api/me` (`Endpoints/MeEndpoints.cs`, `Users/Me.cs`); Settings Profile in `features/settings/Settings.tsx` | True today |
| Email refreshed each sign-in | `Login.cs` (`known.ChangeEmail(email)`) | True today |
| Stored account fields: Google ID, email, display name, time zone, currency, created date | `src/Budget.Domain/Users/User.cs`; `BudgetDbContext.cs` `User` mapping | True today (also `IsDemo`, an internal flag) |
| Stored budget data: cycles, categories, budgets, balances, transactions with notes, timestamps | `BudgetDbContext.cs` DbSets; `Cycle.cs`, `Category.cs`, `CycleCategory.cs`, `Transaction.cs` (`Note` max 280) | True today |
| Data in Azure Australia East | `infra/main.bicep` `location = resourceGroup().location`; resource group created `-l australiaeast` in `docs/plans/m9-infra.md` | Ricky to confirm (region is not in code; check the deployed resources) |
| Backups stay in the region | `infra/modules/sql.bicep` `requestedBackupStorageRedundancy: 'Local'` | True today |
| Backups restore to any point in the last 7 days; gone within about two weeks | `sql.bicep` sets no retention policy, so Azure's default 7 days applies (Basic allows 1 to 7); Azure keeps older full backups as long as a restore point needs them | True today; Ricky to confirm the "about two weeks" outer bound in the portal |
| Re-delete after a restore | No code; a manual step | Ricky to confirm (he must do it by hand if he ever restores) |
| Encrypted in transit | `aca-app.bicep` `allowInsecure: false`; `Hosting/Edge.cs` HSTS; `sql.bicep`/`storage.bicep` TLS 1.2 minimum | True today |
| Encrypted at rest | Azure SQL transparent data encryption, on by default for new databases (not set in bicep); Storage encryption always on | True today (Azure default) |
| Database needs a password | `sql.bicep` SQL authentication; connection string is a Container Apps secret | True today (see flag 7) |
| Only strictly necessary cookies | `Program.cs` (`budget.session`), `Auth/Csrf.cs` (`budget.csrf`, no expiry set, so a browser-session cookie), OpenID Connect handler's correlation cookie (15-minute remote-auth timeout) and nonce cookie (1-hour default nonce lifetime), both deleted on the callback | True today for the app; Cloudflare cookie Ricky to confirm |
| Session 30 days sliding; demo 4 hours | `Program.cs` `ExpireTimeSpan = 30 days`, `SlidingExpiration`; `AuthEndpoints.cs` demo `AddHours(4)` | True today |
| Session cookie HttpOnly, Secure, holds only the user id, encrypted | `Program.cs` cookie options; Data Protection key ring (`DataProtection:BlobUri`) | True today |
| No ads or third-party analytics | `src/web/package.json` dependencies; CSP `default-src 'self'` in `Edge.cs` blocks third-party scripts | True today |
| No bank connections | No such code | True today |
| No card details collected | No payment code; L6 to L8 will use Apple and Google stores | True today |
| Not sold, not used for marketing | No code can show this; a commitment | Ricky to confirm |
| Copy kept on device | `src/web/src/offline/db.ts` (IndexedDB `budget`: `cache`, `outbox`); `vite.config.ts` runtime cache `session` for `GET /api/me` | True today |
| Sign-out removes the copy; unsent changes kept until sent or another user signs in | `features/auth/SessionGate.tsx` `signOut` clears `db.cache` and the `session` cache; `offline/outbox.ts` deletes other users' rows on `configureOutbox` | True today |
| Device-only preferences stay after sign-out | `theme/theme.ts`, `pwa/install.ts`, `features/categories/favourites.ts`, `features/transactions/AddTransactionSheet.tsx` (`budget.lastCategory.*`), `features/cycles/chartFilter.ts` | True today |
| Request records kept 30 days | `infra/modules/monitoring.bicep` Log Analytics `retentionInDays: 30`; App Insights is workspace-based | True today; Ricky to confirm no table-level retention override in the portal |
| IP address not stored; approximate location kept | App Insights default IP masking (`monitoring.bicep` does not set `DisableIpMasking`) | True today; Ricky to confirm what `client_City` holds (flag 1) |
| Records hold no email or budget figures | App's own log calls: `OidcSignIn.cs` (code and provider), `Cycles.cs` (a count), `src/Budget.Jobs/JobHost.cs` (counts); API URLs carry only ids | True today for the app's own logging (see flag 3) |
| IP used in memory for rate limiting | `RateLimiting/RateLimiting.cs`; client address from `CF-Connecting-IP` in `Edge.cs` | True today |
| Cloudflare in front of the app | `infra/parameters/prod.bicepparam` `restrictIngressToCloudflare = true`; `Edge.cs` | True today |
| Demo is shared, reset nightly, caps | `infra/modules/aca-jobs.bicep` `demo-reset` cron `0 17 * * *` (03:00 AEST); `Users/ResetDemo.cs`; `Users/DemoCaps.cs` | True today |
| Accounts kept separate | `BudgetDbContext.cs` query filter and `EnforceTenant()`; `tests/Budget.Api.Tests/TenantIsolationTests.cs` | True today |
| Export as CSV and JSON | L3 (`GET /api/me/export`) | True after L3 |
| Delete account: immediate hard delete after typed confirmation | L4 (`DELETE /api/me`); `UserRepository.DeleteDataAsync` already exists | True after L4 |
| Signing in again after deletion starts a new account | `Login.cs` provisions on unknown subject; L4 removes the row | True after L4 |
| Plans and Premium purchases through Apple and Google | L5 (entitlements), L6 to L8 (store billing, parked) | True after L5 and L6 to L8 |
| Contact address works | `support@tightarse.app` mailbox (launch plan section 5) | Ricky to confirm |
| Reply within 30 days; breach notice | Commitments, no code | Ricky to confirm |
| Minimum age 18 | No check in code; Google does not send an age | Ricky to confirm (open question) |

### Things in the code that cut against this policy

1. **Approximate location in telemetry.** Application Insights derives city, state and country from the client IP for each request, then stores `0.0.0.0` as the IP. The policy discloses this. Whether the location is the user's or an Azure address depends on whether the OpenTelemetry distro sends `client.address` (behind Cloudflare and `UseForwardedHeaders` it would be the user's real IP). Check with `requests | take 20 | project client_City, client_IP` in App Insights. If it is the user's city and Ricky does not want it, a span processor that drops `client.address` removes it (outside this task).
2. **Telemetry outlives account deletion.** Request records are kept 30 days and are not touched by account deletion. They carry no email, name or amounts, but URLs carry cycle and transaction ids. The policy says records last 30 days; it does not say they are deleted with the account.
3. **Framework logs.** Beyond the app's own log calls, ASP.NET Core and EF Core write to console logs (sent to Log Analytics) and App Insights. EF logs SQL text at Information, without parameter values. An unhandled exception is logged with its message; a SQL Server error message can echo a value (for example a truncated string). Validation caps lengths, so this should not happen in practice, but "never" is not guaranteed by code.
4. **Device copy outlives a session.** If a session expires or the account is deleted on another device, the copy on this device stays until someone signs out or another account signs in there. The policy tells users to sign out on shared devices. L4 could clear the device copy on the deleting device; other devices keep theirs until next opened.
5. **Preferences survive sign-out.** Favourite and last-used category ids, theme and chart filter stay in `localStorage`. They are ids, not names or amounts. Disclosed.
6. **Backups beyond 7 days.** Azure keeps the full backup a restore point depends on, so deleted data can sit in backups longer than 7 days. The policy says "normally within 7 days and at most about two weeks".
7. **Database firewall.** `sql.bicep`'s `AllowAllWindowsAzureIps` rule admits connections from any Azure-hosted resource, including other Azure customers', so the password is the real barrier. The policy says only that the database needs a password; it does not claim the database is reachable only by the app.
8. **Cloudflare.** Cloudflare sees every request, including the IP address, on its global network, and may keep its own logs or set a bot-management cookie depending on dashboard settings. None of that is in the repo.
