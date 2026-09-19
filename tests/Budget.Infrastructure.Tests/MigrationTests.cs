using System.Reflection;
using Microsoft.EntityFrameworkCore;

namespace Budget.Infrastructure.Tests;

[Collection(SqlServerCollection.Name)]
public class MigrationTests(SqlServerFixture sql)
{
    [Fact]
    public async Task Migrations_apply_from_empty()
    {
        await using var db = sql.NoUser();

        (await db.Database.GetAppliedMigrationsAsync()).Should().NotBeEmpty();
        (await db.Database.GetPendingMigrationsAsync()).Should().BeEmpty();
    }

    [Fact]
    public void Model_has_no_changes_without_a_migration()
    {
        using var db = sql.NoUser();

        db.Database.HasPendingModelChanges().Should().BeFalse();
    }

    [Fact]
    public void Application_references_neither_ef_core_nor_infrastructure()
    {
        var references = Assembly.Load("Budget.Application").GetReferencedAssemblies();

        references.Should().NotContain(r =>
            r.Name!.StartsWith("Microsoft.EntityFrameworkCore") || r.Name == "Budget.Infrastructure" || r.Name == "Budget.Api");
    }
}
