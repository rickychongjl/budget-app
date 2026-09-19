using Budget.Application;
using Budget.Domain;
using Microsoft.EntityFrameworkCore;

namespace Budget.Infrastructure.Tests;

// What the database refuses on its own, whatever the application code does.
[Collection(SqlServerCollection.Name)]
public class ConstraintTests(SqlServerFixture sql)
{
    private async Task<(User User, Cycle Cycle, Category Category)> SeedAsync(bool withCycleCategory = true)
    {
        var user = await sql.NewUserAsync();
        var cycle = TestData.Confirmed(user);
        var category = new Category(user.Id, CategoryType.Debit, TestData.Now);

        await using var db = sql.ContextFor(user);
        db.AddRange(cycle, category);
        if (withCycleCategory)
        {
            db.Add(TestData.Groceries(cycle, category));
        }

        await db.SaveChangesAsync();
        return (user, cycle, category);
    }

    // A lost unique index is a ConflictException, which Application can recover from. Anything else stays EF's.
    private async Task ShouldBeRejectedAsync<TException>(User user, params object[] rows) where TException : Exception
    {
        await using var db = sql.ContextFor(user);
        db.AddRange(rows);
        await db.Invoking(x => x.SaveChangesAsync()).Should().ThrowAsync<TException>();
    }

    [Fact]
    public async Task Two_cycles_cannot_start_on_the_same_day()
    {
        var a = await SeedAsync();

        await ShouldBeRejectedAsync<ConflictException>(a.User, new Cycle(a.User.Id, a.Cycle.StartDate));
    }

    [Fact]
    public async Task A_conflict_discards_the_failed_unit_of_work()
    {
        var a = await SeedAsync();
        await using var db = sql.ContextFor(a.User);
        db.Add(new Cycle(a.User.Id, a.Cycle.StartDate));
        await db.Invoking(x => x.SaveChangesAsync()).Should().ThrowAsync<ConflictException>();

        db.Add(new Cycle(a.User.Id, a.Cycle.StartDate.AddDays(Cycle.LengthInDays)));
        await db.SaveChangesAsync();

        (await db.Cycles.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task A_category_appears_once_per_cycle()
    {
        var a = await SeedAsync();

        await ShouldBeRejectedAsync<ConflictException>(a.User, TestData.Groceries(a.Cycle, a.Category, name: "Again"));
    }

    [Fact]
    public async Task A_client_id_is_unique_per_user_not_globally()
    {
        var a = await SeedAsync();
        var b = await SeedAsync();
        var clientId = Guid.NewGuid();
        Transaction With(Cycle cycle, Category category) => new(cycle, category.Id, 5m, TestData.Jan1, null, clientId, TestData.Now);

        await using (var db = sql.ContextFor(a.User))
        {
            db.Add(With(a.Cycle, a.Category));
            await db.SaveChangesAsync();
        }

        await using (var db = sql.ContextFor(b.User))
        {
            db.Add(With(b.Cycle, b.Category));
            await db.SaveChangesAsync();
        }

        await ShouldBeRejectedAsync<ConflictException>(a.User, With(a.Cycle, a.Category));
    }

    [Fact]
    public async Task An_external_id_belongs_to_one_user_and_many_users_can_have_none()
    {
        var externalId = Guid.NewGuid().ToString();
        await sql.NewUserAsync(externalId);
        await sql.NewUserAsync();
        await sql.NewUserAsync();

        await sql.Invoking(x => x.NewUserAsync(externalId)).Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task A_cycle_cannot_use_another_users_category()
    {
        var a = await SeedAsync();
        var b = await SeedAsync(withCycleCategory: false);

        await ShouldBeRejectedAsync<DbUpdateException>(b.User, TestData.Groceries(b.Cycle, a.Category));
    }

    [Fact]
    public async Task A_transaction_needs_its_category_to_be_in_its_cycle()
    {
        var a = await SeedAsync(withCycleCategory: false);

        await ShouldBeRejectedAsync<DbUpdateException>(a.User, new Transaction(a.Cycle, a.Category.Id, 5m, TestData.Jan1, null, Guid.NewGuid(), TestData.Now));
    }

    [Fact]
    public async Task A_category_with_transactions_cannot_leave_the_cycle_but_an_unused_one_can()
    {
        var a = await SeedAsync();
        var unused = new Category(a.User.Id, CategoryType.Credit, TestData.Now);

        await using (var db = sql.ContextFor(a.User))
        {
            db.AddRange(
                unused,
                TestData.Groceries(a.Cycle, unused, sortOrder: 1, name: "Salary"),
                new Transaction(a.Cycle, a.Category.Id, 5m, TestData.Jan1, null, Guid.NewGuid(), TestData.Now));
            await db.SaveChangesAsync();
        }

        await using (var db = sql.ContextFor(a.User))
        {
            db.Remove(await db.CycleCategories.SingleAsync(c => c.CategoryId == unused.Id));
            await db.SaveChangesAsync();
        }

        await using (var db = sql.ContextFor(a.User))
        {
            db.Remove(await db.CycleCategories.SingleAsync(c => c.CategoryId == a.Category.Id));
            await db.Invoking(x => x.SaveChangesAsync()).Should().ThrowAsync<DbUpdateException>();
        }
    }
}
