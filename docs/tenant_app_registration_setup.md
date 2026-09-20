# Entra tenant and app registration setup

> **This is a one-time setup.** It is done once, by hand, by the owner of the app. After it is done, nothing here needs repeating
> for a deploy, a new environment build or a new machine (a new machine only needs step 5 again). The two things that do come
> back are listed under "What is not one-time" at the end.

The real user signs in with Microsoft Entra ID (design sections 5.1 and 5.2). The app needs three things from Entra: a tenant, an
app registration in it, and the object id of the one user who is allowed in. None of it costs anything.

## Why this is manual and not in Bicep

Everything else in Azure is Bicep (`infra/`, M9). This is deliberately not:

- A tenant, its user, Security Defaults and the passkey cannot be created by Bicep at all.
- The Microsoft Graph Bicep extension can create an app registration, but it does not support client secrets
  (`passwordCredentials`), and Graph resources do not support `what-if`, which is this project's review step for infra.
- Bicep deploys into the tenant the Azure subscription belongs to. If the sign-in tenant is a separate one, Bicep cannot reach it.
- The deploy pipeline would need Graph application-write permission in the sign-in tenant. That is a lot of privilege to hand
  a pipeline for something created once.

## Before you start

- An Azure account. **Creating an additional tenant needs a paid (pay-as-you-go) subscription**: Microsoft does not let a free or
  trial account create one. Two ways through:
  - The project needs a pay-as-you-go subscription for M9 anyway. Create it first, then create the dedicated tenant.
  - Or skip step 1 and use the default tenant that came with your personal Azure account. It is still yours and not an
    employer's, which is the point of design 5.1. The rest of this guide is the same.
- The repo cloned, and `docker compose` working (`.env` copied from `.env.example`).

## 1. Create the tenant

1. Sign in to the [Azure portal](https://portal.azure.com).
2. **Microsoft Entra ID** > **Overview** > **Manage tenants** > **Create**.
3. Basics: choose **Microsoft Entra ID** (workforce). Not B2C, not External ID.
4. Configuration: an organization name (for example `Budget`), an initial domain name (for example `rickybudget`, giving
   `rickybudget.onmicrosoft.com`), country **Australia**.
5. **Review + create** > **Create**.
6. Switch into the new tenant: the **Settings** icon in the top bar > **Directories + subscriptions** > **Switch**.

You are the tenant's first user and its Global Administrator. That is the one user the design asks for; do not add others.

## 2. Secure the user

1. **Microsoft Entra ID** > **Properties** > **Manage security defaults**: confirm Security Defaults is **Enabled** (it is for a new
   tenant). This gives MFA for free.
2. Go to [mysignins.microsoft.com/security-info](https://mysignins.microsoft.com/security-info) while signed in to the new tenant
   and register Microsoft Authenticator. Add a passkey in Authenticator if it offers one.

## 3. Register the app

1. Open the [Microsoft Entra admin center](https://entra.microsoft.com) and check the tenant in the top right is the new one.
2. **Entra ID** > **App registrations** > **New registration**.
3. Name: `Budget`. Supported account types: **Accounts in this organizational directory only** (single tenant).
4. Redirect URI: platform **Web**, value `https://localhost:5001/auth/callback`. **Register**.
5. On the **Overview** page, copy **Application (client) ID** and **Directory (tenant) ID**.
6. **Authentication**:
   - Add the production redirect URI, `https://<domain>/auth/callback`, once the domain exists (M9). Platform **Web** again, not
     single-page application: the server does the sign-in, the browser never sees a token.
   - Leave **Access tokens** and **ID tokens** under implicit grant **unticked**. The authorization code flow gets the ID token
     from the token endpoint, server to server.
7. **Certificates & secrets** > **Client secrets** > **New client secret**. Description `budget-local`, expiry 12 months or less.
   **Copy the Value now**; it is never shown again. (The Secret ID next to it is not the secret.)
   This secret is for local use only. Production gets its own, `budget-prod`, on this same app registration in M9 (an app
   registration holds several secrets at once): each can then be revoked or rotated without touching the other, and the
   production value never sits on a laptop. A second app registration is not needed.
8. **API permissions**: leave the default (`User.Read`, delegated). The app asks only for `openid profile`; the `oid` claim the
   allowlist checks comes with `profile`. No admin consent is needed.

## 4. Find your object id

**Entra ID** > **Users** > your user > **Object ID**. This is the `oid` the app's allowlist checks. It is an identifier, not a
secret, but it stays out of the repo all the same.

## 5. Configure the app locally

Secrets go in user-secrets, never in a file in the repo. From the repo root:

```
dotnet user-secrets set "Entra:TenantId"     "<directory (tenant) id>"      --project src/Budget.Api
dotnet user-secrets set "Entra:ClientId"     "<application (client) id>"    --project src/Budget.Api
dotnet user-secrets set "Entra:ClientSecret" "<client secret value>"        --project src/Budget.Api
dotnet user-secrets set "Auth:AllowedOids"   "<your object id>"             --project src/Budget.Api
dotnet user-secrets set "ConnectionStrings:Budget" "Server=localhost,1434;Database=budget;User Id=sa;Password=<MSSQL_SA_PASSWORD from .env>;TrustServerCertificate=true" --project src/Budget.Api
```

The SQL container is published on host port `1434` (`1434:1433` in `docker-compose.yml`), not the default `1433`, so it does not
clash with a SQL Server already installed on the machine. That is why the connection string above says `localhost,1434`. The
containers reach it as `Server=sql` on `1433` over the compose network and are unaffected.

Then put the same object id in `.env`, so the `migrate` job creates your `User` row (the app never creates users at request time):

```
AUTH_ALLOWED_OIDS=<your object id>
```

`Auth:AllowedOids` takes several ids separated by commas, if there is ever a second person.

## 6. Check that it works

```
docker compose up -d --build                               # migrate creates your User row; sql listens on localhost:1434
dotnet dev-certs https --trust                             # once per machine
dotnet run --project src/Budget.Api --launch-profile https
```

1. Browse to `https://localhost:5001/auth/login`. You are sent to Microsoft, sign in, and land back on `/`
   (a `404` until the SPA exists in M6; the session cookie is set all the same).
2. Browse to `https://localhost:5001/api/me`. It shows your profile with `"isDemo": false`.
3. Negative check: clear the allowlist (`dotnet user-secrets set "Auth:AllowedOids" "" --project src/Budget.Api`), restart,
   sign in again in a private window. The callback answers `403` with code `auth.not-allowed`. Put the id back afterwards.

If `/auth/login` is `404`, `Entra:ClientId` is not set: the app runs demo-only without it, by design.
If the callback is `403 auth.not-allowed` with the allowlist set, the `User` row is missing: check `AUTH_ALLOWED_OIDS` in `.env` and
run `docker compose up -d --build` again so `migrate` runs.

## What is not one-time

- **Client secrets expire** (at most 24 months; 12 recommended). Create a new one as in step 3.7, update it where it is stored,
  then delete the old one. Put each expiry date in a calendar. `budget-local` and `budget-prod` expire and rotate separately.
- **Production** (M9) adds the production redirect URI in step 3.6 and a second secret, `budget-prod`, created the same way as
  step 3.7 and pasted straight into the Container Apps secret, never into user-secrets or a file. The tenant id, client id and
  allowlist are the same values as local. Microsoft recommends against client secrets in production; M9 may instead use the
  Container App's managed identity as a federated credential on this app registration, in which case `budget-prod` is never
  created and there is nothing to rotate.
