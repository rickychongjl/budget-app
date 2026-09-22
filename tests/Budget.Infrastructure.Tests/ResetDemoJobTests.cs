using Budget.Application;
using Budget.Domain;
using Budget.Jobs;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Budget.Infrastructure.Tests;

// The reset against the real database: the bulk delete respects the foreign keys and the tenant filter,
// and the rebuilt rows pass every constraint.
[Collection(SqlServerCollection.Name)]
public sealed class ResetDemoJobTests(SqlServerFixture sql)
{
    // Follows the fixture rather than pinning a number: how much history the demo carries is a demo decision.
    private static readonly int ExpectedCycles =
        -DemoFixture.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "demo-seed.json"))).FirstCycleStartOffset / 30 + 1;

    [Fact]
    public async Task Reset_rebuilds_the_demo_from_the_fixture_and_leaves_everyone_else_alone()
    {
        var bystander = await sql.NewUserAsync();
        await using (var db = sql.ContextFor(bystander))
        {
            db.Add(TestData.Confirmed(bystander));
            await db.SaveChangesAsync();
        }

        await using var services = JobHost.BuildServices(sql.ConnectionString, allowedOids: null);
        Guid demoId;
        await using (var scope = services.CreateAsyncScope())
        {
            var demo = scope.ServiceProvider.GetRequiredService<DemoUser>();
            await demo.EnsureExistsAsync();
            demoId = await demo.GetIdAsync();
        }

        (await JobHost.ResetDemoAsync(services, onlyIfEmpty: true)).Should().Be(0);

        int seeded;
        await using (var db = sql.ContextFor(demoId))
        {
            (await db.Cycles.CountAsync()).Should().Be(ExpectedCycles);
            seeded = await db.Transactions.CountAsync();
            seeded.Should().BeGreaterThan(20);

            var current = await db.Cycles.OrderByDescending(c => c.StartDate).FirstAsync();
            var category = await db.CycleCategories.FirstAsync(c => c.CycleId == current.Id);
            db.Add(new Transaction(current, category.CategoryId, 1m, current.StartDate, "a visitor was here", Guid.NewGuid(), TestData.Now));
            await db.SaveChangesAsync();
        }

        // Not empty any more, so seeding leaves the visitor's row; a reset does not.
        await JobHost.ResetDemoAsync(services, onlyIfEmpty: true);
        await using (var db = sql.ContextFor(demoId))
        {
            (await db.Transactions.CountAsync()).Should().Be(seeded + 1);
        }

        (await JobHost.ResetDemoAsync(services)).Should().Be(0);

        await using (var db = sql.ContextFor(demoId))
        {
            (await db.Transactions.CountAsync()).Should().Be(seeded);
            (await db.Transactions.AnyAsync(t => t.Note == "a visitor was here")).Should().BeFalse();
            (await db.Cycles.CountAsync()).Should().Be(ExpectedCycles);
            (await db.Categories.CountAsync()).Should().Be(7);
        }

        await using var theirs = sql.ContextFor(bystander);
        (await theirs.Cycles.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Empty_leaves_the_demo_with_nothing_and_a_reset_puts_the_fixture_back()
    {
        await using var services = JobHost.BuildServices(sql.ConnectionString, allowedOids: null);
        Guid demoId;
        await using (var scope = services.CreateAsyncScope())
        {
            var demo = scope.ServiceProvider.GetRequiredService<DemoUser>();
            await demo.EnsureExistsAsync();
            demoId = await demo.GetIdAsync();
        }
        await JobHost.ResetDemoAsync(services);

        (await JobHost.ResetDemoAsync(services, empty: true)).Should().Be(0);

        await using (var db = sql.ContextFor(demoId))
        {
            (await db.Cycles.AnyAsync()).Should().BeFalse();
            (await db.Categories.AnyAsync()).Should().BeFalse();
            (await db.Transactions.AnyAsync()).Should().BeFalse();
        }

        (await JobHost.ResetDemoAsync(services)).Should().Be(0);

        await using var again = sql.ContextFor(demoId);
        (await again.Cycles.CountAsync()).Should().Be(ExpectedCycles);
    }

    [Fact]
    public async Task Deleting_a_users_data_as_someone_else_deletes_nothing()
    {
        var (owner, other) = (await sql.NewUserAsync(), await sql.NewUserAsync());
        await using (var db = sql.ContextFor(owner))
        {
            db.Add(TestData.Confirmed(owner));
            await db.SaveChangesAsync();
        }

        await using (var db = sql.ContextFor(other))
        {
            await new UserRepository(db).DeleteDataAsync(owner.Id);
        }

        await using var check = sql.ContextFor(owner);
        (await check.Cycles.CountAsync()).Should().Be(1);
    }
}
