# Security review — multi-user run (L1 to L9)

**Scope:** every route and change merged into `multi-user` by L1 (#39), L2 (#41), L3 (#42), L4 (#43), L5 (#45), L9 (#46) and
the L10 drafts (#40), reviewed on 15 Nov 2026 at `0b94877`. L6 to L8, L11 and L13 are parked, so billing webhooks, staging and
end-to-end tests are not covered. **Done when** (launch plan L12): the findings list is empty or Ricky accepts each open item
in writing.

Legend: **Fixed** (changed in this PR, with a test), **OK** (checked, nothing to change), **Open** (needs Ricky: a decision,
infra access, or a change bigger than a hardening fix).

## 1. Routes

| Route | Added by | Auth | Antiforgery | Rate limit | Tenant isolation | Verdict |
|---|---|---|---|---|---|---|
| `GET /auth/options` | L1 | anonymous | GET | global (100/min per address) | reads no data | OK |
| `GET /auth/login` | L1 | anonymous | GET (a navigation) | `auth` (5/min per address) | none | OK |
| `/auth/callback` | L1 (OIDC handler) | state + PKCE + nonce, signature and issuer checked | n/a (provider redirect) | global only; answered before routing | `Login` maps `google:<sub>`; refuses unverified email | OK, see S1 |
| `POST /auth/demo`, `POST /auth/logout` | before L1 | anonymous / session | yes | `auth` | demo is a normal user | OK |
| `GET /api/me`, `PATCH /api/me` | L2 (+L5 fields) | session | PATCH yes | global | current user only; demo read-only | **Fixed** S4 |
| `GET /api/me/export` | L3 | session | GET | `export` (5/min per address) | tenant filter; two-user test | OK |
| `DELETE /api/me` | L4 | session | yes | global | refuses unless the scope is that user; attack test | OK |
| `GET /api/plans` | L5 | anonymous (`AllowAnonymous`) | GET | global | static catalogue, no data | OK |
| SPA `/`, `/pricing`, `/privacy`, `/terms` | L9 | none (static files) | n/a | static files are ahead of the limiter | no API call except the demo button | OK |

`TenantIsolationTests.Every_api_route_is_either_attacked_or_known_to_take_no_ids` lists every `/api` route above; the guard is
unchanged.

## 2. Findings

| # | Area | Finding | Verdict |
|---|---|---|---|
| S1 | Sign-in, open redirect | No route accepts a return URL. `/auth/login` challenges with a constant `RedirectUri = "/"`; the OIDC `state` is data-protected, so it cannot be steered. A refused sign-in redirects to `/signin?error=<code>` where the code is one of ours, URL-escaped, and the SPA shows text from its own table (`SignIn.tsx` `REFUSALS`), never the query value. | OK |
| S2 | Sign-up abuse | Accounts are created on first Google sign-in. Each needs a Google account with a verified email, and `/auth/login` is limited to 5 a minute per address; `/auth/callback` has only the global limit. There is **no cap on new accounts per address per day** (the plan's L12 line). The limiter is in memory and per replica (prod runs one). | **Open**: recommend a daily window on `/auth/login` (for example 30 a day per address, chained with the 5/min one) once Cloudflare's client address is confirmed in prod; until then a shared address (mobile carrier NAT) could be locked out. Accept for the closed beta or ask for it. |
| S3 | Antiforgery | Every non-GET under `/api` is in the `RequireCsrfToken` group, including `DELETE /api/me`; `DeleteAccountTests` proves a missing token is 400 and nothing is deleted. | OK |
| S4 | Input: time zone (L2 note) | `User.ChangeTimeZone` accepted a Windows id (`AUS Eastern Standard Time`) through a hand-made `PATCH /api/me`; the web app's `todayIn` reads zones with `Intl`, which knows only IANA ids, so the server and the app would disagree about "today". Now only IANA ids are accepted on change (`TimeZoneInfo.HasIanaId`); the constructor still only checks the zone exists, because EF builds stored rows through it and an existing row must always load. | **Fixed** (`User.cs`; `UserTests`, `MeTests`) |
| S5 | Tenant isolation | `Subscription` (L5) has the query filter, the write guard (generic on `UserId`), a `UserId` foreign key, and is in `DeleteDataAsync`. `UserRepository.DeleteAccountAsync` checks the scope is that user before touching the unfiltered `User` row, inside one transaction. `DeleteAccountTests` (Infrastructure) enumerates tenant tables from the EF model, so a future table missing from deletion fails CI. | OK |
| S6 | Demo | The demo cannot be deleted (`demo.account.undeletable`), its profile is read-only, it is Premium so it shows every feature, and `DemoCaps` still bound it. Its export is the shared demo data, which every visitor can see anyway. | OK |
| S7 | Logs | The app's own log lines (`OidcSignIn` refusal code and provider, `DeleteAccount` outcomes, rollover count) carry no id, email, name or amount. Exceptions handled by `ProblemExceptionHandler` should not be logged by the framework (.NET 10 suppresses exception diagnostics when an `IExceptionHandler` handles it; not verified here, and a `DomainException` message can echo the caller's own input, such as an unknown time zone). An **unhandled** exception is logged with its message, and a SQL Server error message can echo a value; validation caps lengths, so this should not happen in practice. | OK; residual risk noted for the privacy policy (L10 flag 3) |
| S8 | CSP and `HostTests` | No new origin, inline script or frame. L9's pages use the same bundle; `usePageMeta` sets meta tags through the DOM, which CSP does not govern. The Google "G" is inline SVG. `HostTests` expectations unchanged. | OK |
| S9 | Client-side rendering of legal text | `Markdown.tsx` builds React elements from a parsed subset, never `innerHTML`; a test proves `<img onerror>` in the text stays text. The legal copies in the bundle stop before the "Claims and where they are true" notes, which describe weak spots (S12), so those never ship. | OK |
| S10 | Device copy after a session ends (L10 flag 4) | Sign-out cleared the cached reads, but a session that **expired** (or ended elsewhere, or whose account was deleted on another device) only flipped the screen to sign-in: the cached budget stayed in IndexedDB and the service worker's `/api/me` copy could reopen the app offline. Now any 401 clears the cached reads, the in-memory queries, the worker's `/api/me` and the antiforgery token, exactly as sign-out does; the outbox is kept as before. A device that stays offline keeps its copy until it next reaches the server. | **Fixed** (`SessionGate.tsx`; `auth.test.tsx`) |
| S11 | Request logs survive deletion (L10 flag 2) | Application Insights / Log Analytics keep request records 30 days; deletion does not touch them. They carry URLs with cycle and transaction ids but no email, name or amounts. Purging per user is not practical (Log Analytics purge API is slow and coarse). | **Open (accept)**: the privacy policy now says deletion does not shorten the 30 days. Ricky to accept. |
| S12 | SQL firewall (L10 flag 7) | `infra/modules/sql.bicep` has `AllowAllWindowsAzureIps` (0.0.0.0–0.0.0.0), which admits any Azure-hosted caller, including other tenants'; the SQL password is the only barrier. | **Open (infra)**: move the Container App onto a VNet with a private endpoint or service endpoint and drop the rule, or at least use Entra-only auth with the managed identity. Needs Azure access and a what-if; not changed here. |
| S13 | Approximate location in telemetry (L10 flag 1, question 8) | Application Insights derives city/state/country from the client address before masking the IP. Behind Cloudflare with `CF-Connecting-IP` that is the user's real location. | **Open (decision)**: Ricky to check `requests | take 20 | project client_City, client_IP` and decide; if unwanted, a small OpenTelemetry processor that removes `client.address` (and `http.client_ip`) before export fixes it. Left as a decision because the policy already discloses it. |
| S14 | Complimentary Premium (L5) | `Plans:ComplimentaryPremiumEmails` matches the verified `User.Email` only (Login refuses unverified email), so it cannot be claimed without owning that Google account. Empty by default; no address committed. | OK |
| S15 | Dependencies | `npm audit --omit=dev`: 0 vulnerabilities in what ships. Dev tooling has moderate advisories (`@vitest/mocker`, `fast-uri`, `glob`, `deepmerge`), none in the bundle. NuGet audit runs in CI's restore (blocked here); CodeQL is green on every PR. | OK; refresh dev dependencies when convenient |

## 3. What Ricky must decide or do

1. **S2**: accept no daily sign-up cap for the closed beta, or ask for it.
2. **S11**: accept that request records outlive deletion by up to 30 days (the policy says so).
3. **S12**: plan the SQL network change (infra, needs Azure access).
4. **S13**: check the App Insights location columns and decide.
