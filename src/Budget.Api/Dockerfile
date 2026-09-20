# Build context is the repo root: docker build -f src/Budget.Api/Dockerfile .
# One image runs the API and the jobs, so a migration always runs the same code as the revision that follows it.
FROM node:22-alpine AS web
WORKDIR /web
# The lock file first, so the install layer is reused until a dependency changes.
COPY src/web/package.json src/web/package-lock.json ./
RUN npm ci
COPY src/web/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /repo
COPY global.json Directory.Build.props ./
COPY src/ src/
# The reset-demo job reads the demo fixture, which lives with the Playwright specs that share it.
COPY tests/e2e/fixtures/demo-seed.json tests/e2e/fixtures/demo-seed.json
RUN dotnet publish src/Budget.Api -c Release -o /out/api \
 && dotnet publish src/Budget.Jobs -c Release -o /out/jobs

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
# The API serves the SPA from its web root, same origin as /api and /auth.
COPY --from=web /web/dist api/wwwroot
USER $APP_UID
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
# The working directory stays /app so a job is "dotnet jobs/Budget.Jobs.dll <name>". The API is told where it lives,
# or it would look for wwwroot and appsettings.json in /app and find neither.
ENTRYPOINT ["dotnet", "api/Budget.Api.dll", "--contentRoot", "/app/api"]
