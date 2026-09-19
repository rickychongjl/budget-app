using Budget.Domain;
using Microsoft.EntityFrameworkCore;

namespace Budget.Infrastructure.Tests;

[Collection(SqlServerCollection.Name)]
public class TenantIsolationTests(SqlServerFixture sql)
{
    private sealed record Rows(User Owner, Cycle Cycle, Category Category, CycleCategory CycleCategory, Transaction Transaction);

    private async Task<Rows> SeedAsync()
    {
        var owner = await sql.NewUserAsync();
        var cycle = TestData.Confirmed(owner);
        var category = new Category(owner.Id, CategoryType.Debit, TestData.Now);
        var cycleCategory = TestData.Groceries(cycle, category);
        var transaction = new Transaction(cycle, category.Id, 10m, TestData.Jan1, null, Guid.NewGuid(), TestData.Now);

        await using var db = sql.ContextFor(owner);
        db.AddRange(cycle, category, cycleCategory, transaction);
        await db.SaveChangesAsync();
        return new Rows(owner, cycle, category, cycleCategory, transaction);
    }

    [Fact]
    public async Task Another_user_sees_none_of_the_rows()
    {
        var a = await SeedAsync();
        var b = await sql.NewUserAsync();

        await using var db = sql.ContextFor(b);

        (await db.Cycles.ToListAsync()).Should().BeEmpty();
        (await db.Categories.ToListAsync()).Should().BeEmpty();
        (await db.CycleCategories.ToListAsync()).Should().BeEmpty();
        (await db.Transactions.ToListAsync()).Should().BeEmpty();
        (await db.Cycles.FindAsync(a.Cycle.Id)).Should().BeNull();
    }

    [Fact]
    public async Task The_owner_sees_only_their_own_rows()
    {
        var a = await SeedAsync();
        await SeedAsync();

        await using var db = sql.ContextFor(a.Owner);

        (await db.Cycles.SingleAsync()).Id.Should().Be(a.Cycle.Id);
        (await db.Transactions.SingleAsync()).Id.Should().Be(a.Transaction.Id);
    }

    [Fact]
    public async Task Nobody_sees_no_tenant_rows_but_can_list_users()
    {
        var a = await SeedAsync();

        await using var db = sql.NoUser();

        (await db.Cycles.ToListAsync()).Should().BeEmpty();
        (await db.Users.AnyAsync(u => u.Id == a.Owner.Id)).Should().BeTrue();
    }

    [Fact]
    public async Task Inserting_a_row_for_another_user_throws_and_writes_nothing()
    {
        var a = await sql.NewUserAsync();
        var b = await sql.NewUserAsync();

        await using (var db = sql.ContextFor(b))
        {
            db.Cycles.Add(new Cycle(a.Id, TestData.Jan1));
            await db.Invoking(x => x.SaveChangesAsync()).Should().ThrowAsync<InvalidOperationException>();
        }

        await using var asA = sql.ContextFor(a);
        (await asA.Cycles.ToListAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task A_row_without_a_user_is_stamped_with_the_current_one()
    {
        var a = await sql.NewUserAsync();
        var category = new Category(Guid.Empty, CategoryType.Debit, TestData.Now);

        await using (var db = sql.ContextFor(a))
        {
            db.Categories.Add(category);
            await db.SaveChangesAsync();
        }

        await using var read = sql.ContextFor(a);
        (await read.Categories.SingleAsync()).UserId.Should().Be(a.Id);
    }

    [Fact]
    public async Task Nobody_cannot_write_tenant_rows()
    {
        var a = await sql.NewUserAsync();

        await using var db = sql.NoUser();
        db.Cycles.Add(new Cycle(a.Id, TestData.Jan1));

        await db.Invoking(x => x.SaveChangesAsync()).Should().ThrowAsync<InvalidOperationException>();
    }

    // The filter stops B loading A's row, so the only way in is attaching one. That must fail too.
    [Fact]
    public async Task Updating_another_users_attached_row_throws()
    {
        var a = await SeedAsync();
        var b = await sql.NewUserAsync();

        await using (var db = sql.ContextFor(b))
        {
            db.Attach(a.CycleCategory);
            a.CycleCategory.Edit("Hacked", "skull", "red", 0, 1m);
            await db.Invoking(x => x.SaveChangesAsync()).Should().ThrowAsync<InvalidOperationException>();
        }

        await using var asA = sql.ContextFor(a.Owner);
        (await asA.CycleCategories.SingleAsync()).Name.Should().Be("Groceries");
    }

    [Fact]
    public async Task Deleting_another_users_attached_row_throws()
    {
        var a = await SeedAsync();
        var b = await sql.NewUserAsync();

        await using (var db = sql.ContextFor(b))
        {
            db.Remove(a.Transaction);
            await db.Invoking(x => x.SaveChangesAsync()).Should().ThrowAsync<InvalidOperationException>();
        }

        await using var asA = sql.ContextFor(a.Owner);
        (await asA.Transactions.CountAsync()).Should().Be(1);
    }

    [Fact]
    public void The_synchronous_save_is_guarded_too()
    {
        using var db = sql.NoUser();
        db.Cycles.Add(new Cycle(Guid.NewGuid(), TestData.Jan1));

        db.Invoking(x => x.SaveChanges()).Should().Throw<InvalidOperationException>();
    }
}
