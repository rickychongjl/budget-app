# Build context is the repo root: docker build -f src/Budget.Api/Dockerfile .
# One image runs the API and the jobs, so a migration always runs the same code as the revision that follows it.
# The Node stage that builds src/web into wwwroot joins in M6.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /repo
COPY global.json Directory.Build.props ./
COPY src/ src/
RUN dotnet publish src/Budget.Api -c Release -o /out/api \
 && dotnet publish src/Budget.Jobs -c Release -o /out/jobs

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
USER $APP_UID
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "api/Budget.Api.dll"]
