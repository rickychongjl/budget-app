using Budget.Application;
using Budget.Domain;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Testcontainers.MsSql;

namespace Budget.Infrastructure.Tests;

// One container and one migrated database per test run. Tests do not reset it:
// each creates its own user, so the tenant filter keeps them apart.
public sealed class SqlServerFixture : IAsyncLifetime
{
    private readonly MsSqlContainer _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private DbContextOptions<BudgetDbContext> _options = null!;

    public string ConnectionString { get; private set; } = "";

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        var connectionString = new SqlConnectionStringBuilder(_container.GetConnectionString()) { InitialCatalog = "budget" };
        ConnectionString = connectionString.ConnectionString;
        _options = new DbContextOptionsBuilder<BudgetDbContext>().UseSqlServer(ConnectionString).Options;

        await using var db = NoUser();
        await db.Database.MigrateAsync();
    }

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();

    public BudgetDbContext ContextFor(Guid userId) => new(_options, new TestUser(userId));

    public BudgetDbContext ContextFor(User user) => ContextFor(user.Id);

    public BudgetDbContext NoUser() => ContextFor(Guid.Empty);

    public async Task<User> NewUserAsync(string? externalId = null)
    {
        var user = new User("Test", "Australia/Sydney", "AUD", TestData.Now, externalId);
        await using var db = NoUser();
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private sealed record TestUser(Guid Id) : ICurrentUser;
}

[CollectionDefinition(Name)]
public sealed class SqlServerCollection : ICollectionFixture<SqlServerFixture>
{
    public const string Name = "sql";
}

internal static class TestData
{
    public static readonly DateTimeOffset Now = new(2026, 1, 10, 0, 0, 0, TimeSpan.Zero);
    public static readonly DateOnly Jan1 = new(2026, 1, 1);

    public static Cycle Confirmed(User user, DateOnly? start = null)
    {
        var cycle = new Cycle(user.Id, start ?? Jan1);
        cycle.Confirm();
        return cycle;
    }

    public static CycleCategory Groceries(Cycle cycle, Category category, int sortOrder = 0, string name = "Groceries") =>
        new(cycle, category.Id, name, "shopping-cart", "blue", sortOrder, 600m);
}
