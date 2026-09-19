using System.Security.Claims;
using System.Text.Encodings.Web;
using Budget.Domain;
using Budget.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Testcontainers.MsSql;

namespace Budget.Api.Tests;

// One container, one migrated database and one host per test run. Tests do not reset it:
// each creates its own user, so the tenant filter keeps them apart.
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<BudgetDbContext>().Database.MigrateAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _container.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var connectionString = new SqlConnectionStringBuilder(_container.GetConnectionString()) { InitialCatalog = "budget" };
        builder.UseSetting("ConnectionStrings:Budget", connectionString.ConnectionString);
        // Every test shares one address, so the production limit would trip halfway through the run. RateLimitTests lowers it again.
        builder.UseSetting("RateLimiting:PermitLimit", "1000000");
        builder.UseSetting("RateLimiting:AuthPermitLimit", "1000000");

        builder.ConfigureTestServices(services => services
            .AddAuthentication(TestAuth.SchemeName)
            .AddScheme<AuthenticationSchemeOptions, TestAuth>(TestAuth.SchemeName, null));
    }

    public async Task<User> NewUserAsync(bool isDemo = false, string? externalId = null)
    {
        var user = new User("Test", "Australia/Sydney", "AUD", DateTimeOffset.UtcNow, externalId, isDemo);
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetDbContext>();
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    // Arranges rows as the given user. There is no request here, so the context gets its user directly;
    // the tenant stamping and write guard still apply.
    public async Task SeedAsync(User user, params object[] rows)
    {
        using var scope = Services.CreateScope();
        var options = scope.ServiceProvider.GetRequiredService<DbContextOptions<BudgetDbContext>>();
        await using var db = new BudgetDbContext(options, new SeedUser(user.Id));
        db.AddRange(rows);
        await db.SaveChangesAsync();
    }

    private sealed record SeedUser(Guid Id) : Budget.Application.ICurrentUser;

    public HttpClient ClientFor(User user)
    {
        var client = this.CsrfClient();
        client.DefaultRequestHeaders.Add(TestAuth.Header, user.Id.ToString());
        return client;
    }
}

// Does what the SPA's fetch wrapper does: gets an antiforgery token for whoever the client currently is and sends it with a write.
// It fetches before every write rather than caching, so a test can sign in or out and carry on. CsrfTests use plain clients instead.
internal sealed class CsrfHandler : DelegatingHandler
{
    public const string Header = "X-XSRF-TOKEN";

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        if (request.Method != HttpMethod.Get && !request.Headers.Contains(Header))
        {
            var fetch = new HttpRequestMessage(HttpMethod.Get, new Uri(request.RequestUri!, "/auth/csrf"));
            if (request.Headers.TryGetValues(TestAuth.Header, out var user))
            {
                fetch.Headers.Add(TestAuth.Header, user);
            }

            if (RequestToken(await base.SendAsync(fetch, ct)) is { } token)
            {
                request.Headers.Add(Header, token);
            }
        }

        return await base.SendAsync(request, ct);
    }

    public static string? RequestToken(HttpResponseMessage response) =>
        response.Headers.TryGetValues("Set-Cookie", out var cookies)
            && cookies.FirstOrDefault(c => c.StartsWith("XSRF-TOKEN=", StringComparison.Ordinal)) is { } cookie
            ? Uri.UnescapeDataString(cookie["XSRF-TOKEN=".Length..cookie.IndexOf(';')])
            : null;
}

internal static class CsrfClientExtensions
{
    // The token fetch has to pass through the cookie handler too, so the antiforgery cookie is kept and sent back.
    public static HttpClient CsrfClient(this WebApplicationFactory<Program> host, WebApplicationFactoryClientOptions? options = null) =>
        host.CreateDefaultClient((options ?? new()).BaseAddress, new CsrfHandler(), new CookieContainerHandler());
}

// Lets a test act as any user without signing in: only the demo user can get a real cookie until Entra arrives in M5.
// Everything after authentication is the real pipeline.
internal sealed class TestAuth(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Test";
    public const string Header = "X-Test-User";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // Without the header this is the production path: the real session cookie, or nobody.
        if (!Request.Headers.TryGetValue(Header, out var userId))
        {
            return await Context.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        }

        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString())], SchemeName);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}
