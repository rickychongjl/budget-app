# Google sign-in setup

> **This is a one-time setup**, done by hand by the owner of the app. It replaces the Entra tenant and app registration guide
> (`tenant_app_registration_setup.md`, removed in L1). What comes back later is listed under "What is not one-time" at the end.

Anyone with a Google account can sign in and gets their own account on first sign-in (design sections 5.1 and 5.2). The server
does OpenID Connect against `https://accounts.google.com` itself (authorization code + PKCE, scopes `openid email profile`), so the
browser never sees a token. The app needs one thing from Google: an OAuth client (a client id and a client secret) per environment.
None of it costs anything.

## Why this is manual and not in Bicep

A Google Cloud project, its consent screen and OAuth clients live in Google Cloud, not Azure, and Google offers no API to create an
OAuth web client. The client secret is pasted into user-secrets locally and into a Container Apps secret in production.

## 1. Create the Google Cloud project and the consent screen

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project, for example `tight-arse`.
2. **Google Auth Platform** (APIs & Services > OAuth consent screen) > **Get started**.
   - App name `Tight Arse`, a user support email, audience **External**, a developer contact email.
   - **Branding**: the app logo, the home page, privacy policy and terms URLs once they exist (L9, L10), and the authorised domain
     (`tightarse.app`).
   - **Data access**: the default `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile` scopes are all the app asks for.
     They are non-sensitive, so the app does not need Google's verification review.
3. **Audience**: while the app is in **Testing**, only the test users listed there can sign in (up to 100). **Publish app** when
   strangers should be able to sign up. With only non-sensitive scopes, publishing needs no review.

## 2. Create the OAuth clients

**Clients** > **Create client**, application type **Web application**. One client per environment, so each secret can be revoked or
rotated alone and the production secret never sits on a laptop:

| Client | Authorised redirect URIs |
|---|---|
| `budget-local` | `https://localhost:5001/auth/callback` and `http://localhost:8080/auth/callback` |
| `budget-prod` | `https://<domain>/auth/callback` (today `https://tightarse.app/auth/callback`) |
| `budget-staging` (D6, later) | `https://<staging domain>/auth/callback` |

Leave **Authorised JavaScript origins** empty: nothing in the browser talks to Google. Copy the **Client ID** and the
**Client secret** when the client is created. The client id is not a secret (the local one is in
`docs/multi-user-launch-plan.md` section 6); the client secret is, and never goes in the repo.

## 3. Configure the app locally

Secrets go in user-secrets, never in a file in the repo. From the repo root:

```
dotnet user-secrets set "Google:ClientId"     "47567868385-9h2n07u3ehvbactro1ctbr51bkffcit3.apps.googleusercontent.com" --project src/Budget.Api
dotnet user-secrets set "Google:ClientSecret" "<budget-local client secret>"  --project src/Budget.Api
dotnet user-secrets set "ConnectionStrings:Budget" "Server=localhost,1434;Database=budget;User Id=sa;Password=<MSSQL_SA_PASSWORD from .env>;TrustServerCertificate=true" --project src/Budget.Api
```

Both Google settings or neither: with either missing, `/auth/options` reports only `demo`, `/auth/login` is `404`, and the app runs
demo-only, by design. The SQL container is published on host port `1434` (`1434:1433` in `docker-compose.yml`), so it does not clash
with a SQL Server already installed on the machine.

For the `docker compose` stack on `http://localhost:8080`, put the same two values in `.env` (gitignored) as `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`. The `https://localhost:5001` profile is the dependable one: the sign-in's correlation cookies are `Secure`
and `SameSite=None`, which Chrome accepts on `http://localhost` but Safari does not.

### Taking over the original account (one-off)

The original account was created for an Entra object id. To keep its data, set the Google address of its owner before the first
Google sign-in:

```
dotnet user-secrets set "Auth:AdoptLegacyUserEmail" "<your Google address>" --project src/Budget.Api
```

The first Google sign-in whose **verified** email equals that setting re-points the one existing non-demo `User` row that still has a
bare Entra oid at the Google subject (`google:<sub>`), instead of creating a new account. It does nothing if the email is not
verified, if no user is left with a bare oid, if more than one is, or if that Google account is already linked to a row. Once it has
happened, later sign-ins find the row by its subject, so leaving the setting in place is harmless; clear it when convenient. The
value is personal data: it lives in user-secrets and the deployment's environment, never in the repo, and is never logged.

## 4. Check that it works

```
docker compose up -d --build                               # sql on localhost:1434, migrate, the stack on :8080
dotnet dev-certs https --trust                             # once per machine
dotnet run --project src/Budget.Api --launch-profile https
```

1. Browse to `https://localhost:5001/` and choose **Continue with Google**. Google's account chooser opens; pick an account and you
   land back on `/`, in onboarding for a new account.
2. `https://localhost:5001/api/me` shows your profile with `"isDemo": false` and your Google name as `displayName`.
3. Sign out and sign in again with the same Google account: the same account comes back (same `id` in `/api/me`).

A refused sign-in lands on `/signin?error=<code>` with no session: `auth.email-unverified` when Google has not verified the address,
`auth.failed` for anything else (a cancelled consent, a token that does not validate). The log says which code, never who.

## 5. Production

The Container App reads `Google__ClientId`, `Google__ClientSecret` (a Container Apps secret, `google-client-secret`) and
`Auth__AdoptLegacyUserEmail`. They come from the shell that runs the Bicep deployment (`infra/parameters/prod.bicepparam`), never
from a file:

```
$env:GOOGLE_CLIENT_ID = '<budget-prod client id>'
$env:GOOGLE_CLIENT_SECRET = '<budget-prod client secret>'
$env:AUTH_ADOPT_LEGACY_USER_EMAIL = '<your Google address>'    # only until your first production sign-in
az deployment group what-if -g bgt-prod-rg -f infra/main.bicep -p infra/parameters/prod.bicepparam
az deployment group create  -g bgt-prod-rg -f infra/main.bicep -p infra/parameters/prod.bicepparam
```

Then sign in once at `https://<domain>/` with **Continue with Google**: your existing data should be there. After that the adopt
email can be left empty on the next deployment.

## What is not one-time

- **Client secrets**: Google client secrets do not expire on a schedule, but rotate one if it may have leaked: add a new secret on
  the client, update it where it is stored (user-secrets, or `$env:GOOGLE_CLIENT_SECRET` and deploy), then disable and delete the old one.
- **A new environment** (staging, D6) gets its own client with its own redirect URI.
- **A new domain** needs its redirect URI added to the production client before the switch.
