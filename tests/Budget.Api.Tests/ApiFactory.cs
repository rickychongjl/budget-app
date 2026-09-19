using System.Security.Claims;
using System.Text.Encodings.Web;
using Budget.Domain;
using Budget.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
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

        builder.ConfigureTestServices(services => services
            .AddAuthentication(TestAuth.SchemeName)
            .AddScheme<AuthenticationSchemeOptions, TestAuth>(TestAuth.SchemeName, null));
    }

    public async Task<User> NewUserAsync(bool isDemo = false)
    {
        var user = new User("Test", "Australia/Sydney", "AUD", DateTimeOffset.UtcNow, isDemo: isDemo);
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
        var client = CreateClient();
        client.DefaultRequestHeaders.Add(TestAuth.Header, user.Id.ToString());
        return client;
    }
}

// Stands in for the session cookie, which nothing can issue until M5. Everything after authentication is the real pipeline.
internal sealed class TestAuth(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Test";
    public const string Header = "X-Test-User";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(Header, out var userId))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString())], SchemeName);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}
