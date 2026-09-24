using Budget.Domain;
using Microsoft.EntityFrameworkCore;

namespace Budget.Infrastructure.Tests;

[Collection(SqlServerCollection.Name)]
public class MappingTests(SqlServerFixture sql)
{
    [Fact]
    public async Task User_round_trips()
    {
        var user = await sql.NewUserAsync(externalId: Guid.NewGuid().ToString());

        await using var db = sql.NoUser();
        var read = await db.Users.SingleAsync(u => u.Id == user.Id);

        read.Should().BeEquivalentTo(user);
    }

    [Fact]
    public async Task Cycle_round_trips_with_and_without_balances()
    {
        var user = await sql.NewUserAsync();
        var draft = new Cycle(user.Id, TestData.Jan1);
        var confirmed = TestData.Confirmed(user, TestData.Jan1.AddDays(30));
        new CycleTimeline([confirmed]).SetClosingBalance(confirmed, 9999999999999999.99m, TestData.Jan1.AddDays(30));

        await using (var write = sql.ContextFor(user))
        {
            write.Cycles.AddRange(draft, confirmed);
            await write.SaveChangesAsync();
        }

        await using var db = sql.ContextFor(user);
        var read = await db.Cycles.OrderBy(c => c.StartDate).ToListAsync();

        read.Should().BeEquivalentTo([draft, confirmed], o => o.WithStrictOrdering());
        read[0].Status.Should().Be(CycleStatus.Draft);
        read[0].OpeningBalance.Should().BeNull();
        read[1].ClosingBalance.Should().Be(9999999999999999.99m);
    }

    [Fact]
    public async Task Category_snapshot_and_transaction_round_trip()
    {
        var user = await sql.NewUserAsync();
        var cycle = TestData.Confirmed(user);
        var category = new Category(user.Id, CategoryType.Credit, TestData.Now);
        var snapshot = TestData.Groceries(cycle, category, sortOrder: 3);

        // A refund, dated outside the cycle, edited later: the awkward but legal case.
        var transaction = new Transaction(cycle, category.Id, 12.34m, TestData.Jan1, "note", Guid.NewGuid(), TestData.Now);
        transaction.Edit(category.Id, -45.67m, TestData.Jan1.AddDays(-5), null, TestData.Now.AddHours(1));

        await using (var write = sql.ContextFor(user))
        {
            write.AddRange(cycle, category, snapshot, transaction);
            await write.SaveChangesAsync();
        }

        await using var db = sql.ContextFor(user);
        (await db.Categories.SingleAsync(c => c.Id == category.Id)).Should().BeEquivalentTo(category);
        (await db.CycleCategories.SingleAsync(c => c.Id == snapshot.Id)).Should().BeEquivalentTo(snapshot);
        (await db.Transactions.SingleAsync(t => t.Id == transaction.Id)).Should().BeEquivalentTo(transaction);
    }

    [Fact]
    public async Task Edits_to_a_loaded_entity_are_saved()
    {
        var user = await sql.NewUserAsync();
        var cycle = TestData.Confirmed(user);
        var category = new Category(user.Id, CategoryType.Debit, TestData.Now);

        await using (var write = sql.ContextFor(user))
        {
            write.AddRange(cycle, category, TestData.Groceries(cycle, category));
            await write.SaveChangesAsync();
        }

        await using (var edit = sql.ContextFor(user))
        {
            (await edit.CycleCategories.SingleAsync()).Edit("Food", "apple", "green", 1, 650.5m, spreadEvenly: false);
            await edit.SaveChangesAsync();
        }

        await using var db = sql.ContextFor(user);
        var read = await db.CycleCategories.SingleAsync();
        (read.Name, read.Icon, read.Colour, read.SortOrder, read.BudgetAmount, read.SpreadEvenly).Should().Be(("Food", "apple", "green", 1, 650.5m, false));
    }

    // Expand before contract: the previous app version inserts snapshots without SpreadEvenly and must still succeed,
    // and every row that existed before the column did is a category spent a little at a time until the user says not.
    [Fact]
    public async Task A_snapshot_written_without_spread_evenly_is_spread_evenly()
    {
        var user = await sql.NewUserAsync();
        var cycle = TestData.Confirmed(user);
        var category = new Category(user.Id, CategoryType.Debit, TestData.Now);

        await using (var write = sql.ContextFor(user))
        {
            write.AddRange(cycle, category);
            await write.SaveChangesAsync();
            await write.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO CycleCategory (Id, UserId, CycleId, CategoryId, Name, Icon, Colour, SortOrder, BudgetAmount)
                VALUES ({Guid.NewGuid()}, {user.Id}, {cycle.Id}, {category.Id}, 'Food', 'utensils', 'blue', 0, 400)
                """);
        }

        await using var db = sql.ContextFor(user);
        (await db.CycleCategories.SingleAsync()).SpreadEvenly.Should().BeTrue();
    }

    // Shifting by exactly one cycle length makes each future cycle take the next one's old date,
    // which trips the unique (UserId, StartDate) index unless the updates are ordered.
    [Fact]
    public async Task Redating_future_cycles_by_a_whole_cycle_saves_in_one_go()
    {
        var user = await sql.NewUserAsync();
        var first = TestData.Confirmed(user);
        var second = first.CreateNext();
        var third = second.CreateNext();

        await using (var write = sql.ContextFor(user))
        {
            write.Cycles.AddRange(first, second, third);
            await write.SaveChangesAsync();
        }

        await using (var edit = sql.ContextFor(user))
        {
            var timeline = new CycleTimeline(await edit.Cycles.ToListAsync());
            timeline.MoveStart(timeline.Cycles[0], TestData.Jan1.AddDays(30), TestData.Jan1);
            await edit.SaveChangesAsync();
        }

        await using var db = sql.ContextFor(user);
        (await db.Cycles.OrderBy(c => c.StartDate).Select(c => c.StartDate).ToListAsync())
            .Should().Equal(TestData.Jan1.AddDays(30), TestData.Jan1.AddDays(60), TestData.Jan1.AddDays(90));
    }
}
