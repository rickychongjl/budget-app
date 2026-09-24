# M9 plan: Bicep environment, deploy workflow, Cloudflare, App Insights

Source: `docs/solution-design.md` sections 2.2 (topology), 5.4 (Data Protection), 6 (hardening), 10 (CI/CD), 11 (Bicep), 12 (observability), 15 (cost) and section 17 item 9. Observability moved here from item 10 because the monitoring resources are part of the environment and the app needs the SDK for the first deploy to be visible at all; M10 is left as writing (README, ADRs).

## Status: implemented, awaiting the runbook

Code: `dotnet build -warnaserror` clean; API tests 88 (84 + 4 new), all green; the Bicep compiles with no warnings; the Playwright suite green against this branch's image (see "Checked" below). Nothing is deployed yet: every Azure and Cloudflare step needs the owner's accounts and is listed under "Go live" below, in order.

What landed:

- **`infra/`**: `main.bicep` and seven modules, one per row of design section 11, plus `parameters/prod.bicepparam`. Secrets and the alert email come from environment variables (`readEnvironmentVariable`), never the file.
- **`deploy.yml`**: on push to `main`, `ci.yml` (now also `workflow_call`) → one image to GHCR tagged with the SHA and `latest` → the `migrate` job on the new image, polled to completion → the app and the two scheduled jobs moved to the tag. `concurrency: deploy` keeps runs in order. The last job is skipped until the three `AZURE_*` repository variables exist, which is how the first image gets built before the infrastructure that pulls it.
- **`Edge`** (`src/Budget.Api/Hosting/Edge.cs`): forwarded headers (`X-Forwarded-Proto` from the ingress, the address from Cloudflare's `CF-Connecting-IP`), HSTS outside Development, and the section 6 response headers (CSP, nosniff, referrer, permissions). Tested: an http request with the forwarded header is https (HSTS appears, the Entra `redirect_uri` is https), the rate limiter keys on the Cloudflare header, every response carries the headers.
- **App Insights** through the Azure Monitor OpenTelemetry distro, one guarded line: on when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set, absent locally and in tests.
- **SQL retry** (`EnableRetryOnFailure`) in Infrastructure: Azure SQL drops connections now and then. Safe because nothing opens its own transaction.

Where it differs from the design, and why:

- **SQL authentication, not an Entra admin.** The app connects with a login and password held as a Container Apps secret (section 6 already said "connection string as ACA secret"). Managed-identity SQL access needs a `CREATE USER ... FROM EXTERNAL PROVIDER` run inside the database, which Bicep cannot do; a deployment script for one statement is not worth its own identity and storage. Add an Entra admin in the portal if you want to query from there.
- **No registry secret.** The repository is public, so the package GHCR links to it is public and Container Apps pulls anonymously. ADR 10's PAT is only needed if the package is ever made private.
- **The custom domain is two parameters and one CLI command**, not a Bicep certificate resource. A managed certificate needs the hostname bound to the app before it can be issued, and the app then needs the certificate's id: pure Bicep takes three deploys with conditional resources. Instead: deploy with `customDomain` (HTTP-only binding), `az containerapp hostname bind` issues the certificate, deploy again with `customDomainCertificateId`. The binding is declared in Bicep so a later deploy does not drop it.
- **Ingress restriction is a boolean.** `restrictIngressToCloudflare` switches Cloudflare's published ranges (kept in `main.bicep`) on; off until the domain is proxied, or nothing could reach the app.
- **Log alerts every fifteen minutes, not five.** A failure rate and a P95 are not platform metrics, so they are scheduled query rules, priced by frequency; fifteen is the cheapest tier. Both leave out the liveness probe (`GET /health` every 30 s), and the failure rate counts 5xx only, at least three: App Insights marks every 4xx failed, and here a 4xx is the app refusing someone as designed (signed-out `/api/me`, scanners' 404s, the rate limiter), which fired the first version all night. The two job alerts are metric alerts on `Executions` with `state = Failed`, hourly.
- **A job's command is not its name.** Each job in `aca-jobs.bicep` carries the `Budget.Jobs` argument it runs; the demo job is `demo-reset` in Azure and `reset-demo` in the entry point.
- **Migrations run `Database.MigrateAsync` in the job**, as since M3, not an EF bundle (section 10 step 2).
- **No `infra.yml` what-if workflow yet.** Section 11 says "later"; `what-if` is run by hand as the review step (below).
- **HSTS is the middleware default**, thirty days without preload, which is what section 6 asks for in the first month. Raise `MaxAge`, add `IncludeSubDomains` and `Preload`, then submit to hstspreload.org.
- **Security headers come from the app**, not Cloudflare transform rules, so they hold on the Azure hostname too and are tested. `style-src 'unsafe-inline'` is the one concession: React sets style attributes (progress width, category colour) and Recharts does the same on its SVG.

Learning notes, as section 11 asked: **modules and outputs** (`main.bicep` wires seven modules by their outputs); **`existing` references** (`aca-environment.bicep` reads the workspace key without it crossing a module boundary, `aca-app.bicep` scopes a role to the blob container); **`@secure()`** (the SQL password and Entra secret, passed module to module, never output); **role assignment names** (`guid(scope, principal, role)`, so a redeploy finds the same assignment instead of adding a duplicate); **`what-if`** as the review step (below); and **`readEnvironmentVariable`** in a `.bicepparam`, so the parameter file can be committed.

Checked against a real stack, not only tests: this branch's production image on its own port with a throwaway SQL container, and the full Playwright suite (every user story, offline, the worker) against it, 22 of 22, which is what proves the CSP breaks nothing in the built SPA. The first run had one failure that was the spec's, not the app's: `getByLabel('Start date')` also matched the open "Move the start date?" dialog for the instant before it closed; it is `exact` now. Not checked, and why: anything in Azure or Cloudflare; the runbook is the first run.

## Go live

PowerShell, from the repo root, once. Steps 6 to 8 need a domain; the app is reachable on its Azure hostname after step 5.

**Before you start:** a pay-as-you-go subscription; the Entra tenant and app registration from `docs/tenant_app_registration_setup.md` (optional: without `ENTRA_*` the app is demo-only); `az login`; `gh auth login`.

1. **Merge this PR.** `deploy.yml` runs on `main`: tests, then the image to `ghcr.io/rickychongjl/budget-app`; the deploy job is skipped. Check the package is public at github.com/rickychongjl/budget-app/pkgs/container/budget-app (Package settings → Change visibility, if it is not).
2. **Resource group.**
   ```
   az group create -n bgt-prod-rg -l australiaeast --tags project=budget env=prod owner=ricky
   ```
3. **Secrets in the shell**, never in a file. The Entra values are the local ones; the client secret is a new one, `budget-prod`, on the same app registration.
   ```
   $env:SQL_ADMIN_PASSWORD = '<16+ chars, upper, lower, digit, symbol>'
   $env:ALERT_EMAIL = '<you>'
   $env:ENTRA_TENANT_ID = '<directory id>'; $env:ENTRA_CLIENT_ID = '<application id>'; $env:ENTRA_CLIENT_SECRET = '<budget-prod>'; $env:AUTH_ALLOWED_OIDS = '<your object id>'
   ```
4. **Review, then deploy.** About ten minutes; SQL and the environment are the slow ones.
   ```
   az deployment group what-if -g bgt-prod-rg -f infra/main.bicep -p infra/parameters/prod.bicepparam
   az deployment group create  -g bgt-prod-rg -f infra/main.bicep -p infra/parameters/prod.bicepparam
   az deployment group show    -g bgt-prod-rg -n main --query properties.outputs
   ```
   The app comes up on its Azure hostname (`apiFqdn`) with `/health` green and `/api/*` failing until the database is migrated, which is the next step.
5. **Hand GitHub the identity and deploy.** The values are the deployment's outputs.
   ```
   gh variable set AZURE_CLIENT_ID -b <deployClientId>
   gh variable set AZURE_TENANT_ID -b <tenantId>
   gh variable set AZURE_SUBSCRIPTION_ID -b <subscriptionId>
   gh workflow run deploy.yml; gh run watch
   ```
   The migrate job creates the schema, the demo user and yours, and seeds the demo. Open `https://<apiFqdn>`, try the demo, add a transaction. Live Metrics in App Insights shows the requests.
6. **Domain.** Buy one; add the site to Cloudflare (Free) and move the nameservers to it. In Cloudflare DNS, with the proxy **off** (grey cloud) for now:
   - `CNAME  <host>        <apiFqdn>` (`@` is fine: Cloudflare flattens it)
   - `TXT    asuid.<host>  <customDomainVerificationId>`

   Set `param customDomain = '<host.domain>'` in `prod.bicepparam`, run step 4's what-if and create. The domain answers over HTTP only.
7. **Certificate.** Container Apps issues and renews it.
   ```
   az containerapp hostname bind -g bgt-prod-rg -n bgt-prod-api --environment bgt-prod-env --hostname <host.domain> --validation-method CNAME
   az containerapp env certificate list -g bgt-prod-rg -n bgt-prod-env --query "[].id" -o tsv
   ```
   Set `param customDomainCertificateId = '<that id>'` and deploy again: what-if should show only the binding changing. `https://<host.domain>` works.
   In the app registration, add `https://<host.domain>/auth/callback` under Authentication → Web redirect URIs.
8. **Cloudflare in front.** Turn the proxy **on** (orange cloud); SSL/TLS → **Full (strict)**; Edge Certificates → **Always Use HTTPS** on. Then set `param restrictIngressToCloudflare = true` and deploy: the Azure hostname now answers 403 and the domain still works. From here the rate limiter sees each phone's address.
9. **Look around once.** Monitor → Alert rules lists four (failure rate, P95, rollover failed, demo-reset failed); the rollover job's execution history shows a run at five past the hour; Cost Management shows the A$30 budget.

**Rollback** is the release step with the previous tag:
```
az containerapp update -n bgt-prod-api -g bgt-prod-rg --image ghcr.io/rickychongjl/budget-app:<previous sha>
```

**Not one-time:** the Entra client secret expires (12 months): create a new one, update `$env:ENTRA_CLIENT_SECRET`, deploy. Cloudflare's IP ranges change rarely; when they do, update the list in `main.bicep` and deploy.
