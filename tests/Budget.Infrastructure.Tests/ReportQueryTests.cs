using Budget.Application;
using Budget.Domain;

namespace Budget.Infrastructure.Tests;

// The two queries the report adds: every snapshot and every per-category sum in one round trip each.
[Collection(SqlServerCollection.Name)]
public class ReportQueryTests(SqlServerFixture sql)
{
    private static Transaction Spend(Cycle cycle, Category category, decimal amount) =>
        new(cycle, category.Id, amount, cycle.StartDate, null, Guid.NewGuid(), TestData.Now);

    [Fact]
    public async Task Sums_are_grouped_by_cycle_and_category_with_reversals_subtracted()
    {
        var user = await sql.NewUserAsync();
        var january = TestData.Confirmed(user);
        var february = january.CreateNext();
        var groceries = new Category(user.Id, CategoryType.Debit, TestData.Now);
        var rent = new Category(user.Id, CategoryType.Debit, TestData.Now);
        var salary = new Category(user.Id, CategoryType.Credit, TestData.Now);

        await using (var db = sql.ContextFor(user))
        {
            db.Cycles.AddRange(january, february);
            db.Categories.AddRange(groceries, rent, salary);
            // A transaction's category must be in its cycle; the schema has the foreign key to prove it.
            db.CycleCategories.AddRange(
                TestData.Groceries(january, groceries, sortOrder: 1),
                TestData.Groceries(january, salary, sortOrder: 2, name: "Salary"),
                TestData.Groceries(february, groceries, sortOrder: 1),
                TestData.Groceries(february, rent, sortOrder: 2, name: "Rent"));
            db.Transactions.AddRange(
                Spend(january, groceries, 100m),
                Spend(january, groceries, 50.25m),
                Spend(january, groceries, -20.25m),
                Spend(january, salary, 3000m),
                Spend(february, groceries, 10m),
                Spend(february, rent, 1200m));
            await db.SaveChangesAsync();
        }

        await using var read = sql.ContextFor(user);

        var totals = await new TransactionRepository(read).SumByCategoryAsync();

        totals.Should().BeEquivalentTo([
            new CategoryTotal(january.Id, groceries.Id, 130m),
            new CategoryTotal(january.Id, salary.Id, 3000m),
            new CategoryTotal(february.Id, groceries.Id, 10m),
            new CategoryTotal(february.Id, rent.Id, 1200m)]);
    }

    [Fact]
    public async Task A_category_with_no_transactions_has_no_row()
    {
        var user = await sql.NewUserAsync();
        var cycle = TestData.Confirmed(user);
        var category = new Category(user.Id, CategoryType.Debit, TestData.Now);

        await using (var db = sql.ContextFor(user))
        {
            db.Cycles.Add(cycle);
            db.Categories.Add(category);
            db.CycleCategories.Add(TestData.Groceries(cycle, category));
            await db.SaveChangesAsync();
        }

        await using var read = sql.ContextFor(user);

        (await new TransactionRepository(read).SumByCategoryAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task Another_users_transactions_are_never_summed()
    {
        var stranger = await sql.NewUserAsync();
        var theirCycle = TestData.Confirmed(stranger);
        var theirCategory = new Category(stranger.Id, CategoryType.Debit, TestData.Now);

        await using (var db = sql.ContextFor(stranger))
        {
            db.Cycles.Add(theirCycle);
            db.Categories.Add(theirCategory);
            db.CycleCategories.Add(TestData.Groceries(theirCycle, theirCategory, name: "Theirs"));
            db.Transactions.Add(Spend(theirCycle, theirCategory, 999m));
            await db.SaveChangesAsync();
        }

        var user = await sql.NewUserAsync();
        var cycle = TestData.Confirmed(user);
        var category = new Category(user.Id, CategoryType.Debit, TestData.Now);

        await using (var db = sql.ContextFor(user))
        {
            db.Cycles.Add(cycle);
            db.Categories.Add(category);
            db.CycleCategories.Add(TestData.Groceries(cycle, category));
            db.Transactions.Add(Spend(cycle, category, 5m));
            await db.SaveChangesAsync();
        }

        await using var read = sql.ContextFor(user);

        (await new TransactionRepository(read).SumByCategoryAsync())
            .Should().ContainSingle().Which.Should().Be(new CategoryTotal(cycle.Id, category.Id, 5m));
    }

    // The whole point of summing in SQL: a user with five years of history must cost what one with two cycles costs.
    [Fact]
    public async Task The_report_costs_the_same_number_of_queries_however_many_cycles_there_are()
    {
        async Task<int> QueriesFor(int cycleCount)
        {
            var user = await sql.NewUserAsync();
            var category = new Category(user.Id, CategoryType.Debit, TestData.Now);
            var cycles = new List<Cycle> { TestData.Confirmed(user) };
            while (cycles.Count < cycleCount)
            {
                cycles.Add(cycles[^1].CreateNext());
            }

            await using (var db = sql.ContextFor(user))
            {
                db.Cycles.AddRange(cycles);
                db.Categories.Add(category);
                foreach (var cycle in cycles)
                {
                    db.CycleCategories.Add(TestData.Groceries(cycle, category));
                    db.Transactions.Add(Spend(cycle, category, 10m));
                }

                await db.SaveChangesAsync();
            }

            var counter = new CommandCounter();
            await using var read = sql.ContextFor(user, counter);
            var reports = new Reports(
                new CategoryRepository(read),
                new TransactionRepository(read),
                new CycleFinder(new CycleRepository(read), new UserToday(new TestUser(user.Id), new UserRepository(read), TimeProvider.System)));

            (await reports.ListAsync()).Should().HaveCount(cycleCount);
            return counter.Count;
        }

        var six = await QueriesFor(6);
        var two = await QueriesFor(2);

        // In range as well as equal, so a counter that counts nothing cannot pass this at zero.
        six.Should().Be(two).And.BeInRange(1, 8);
    }

    [Fact]
    public async Task Snapshots_come_back_for_every_cycle_of_the_current_user_only()
    {
        var stranger = await sql.NewUserAsync();
        var theirCycle = TestData.Confirmed(stranger);
        var theirCategory = new Category(stranger.Id, CategoryType.Debit, TestData.Now);

        await using (var db = sql.ContextFor(stranger))
        {
            db.Cycles.Add(theirCycle);
            db.Categories.Add(theirCategory);
            db.CycleCategories.Add(TestData.Groceries(theirCycle, theirCategory, name: "Theirs"));
            await db.SaveChangesAsync();
        }

        var user = await sql.NewUserAsync();
        var january = TestData.Confirmed(user);
        var february = january.CreateNext();
        var groceries = new Category(user.Id, CategoryType.Debit, TestData.Now);
        var rent = new Category(user.Id, CategoryType.Debit, TestData.Now);

        await using (var db = sql.ContextFor(user))
        {
            db.Cycles.AddRange(january, february);
            db.Categories.AddRange(groceries, rent);
            db.CycleCategories.AddRange(
                TestData.Groceries(january, groceries, sortOrder: 1),
                TestData.Groceries(january, rent, sortOrder: 2, name: "Rent"),
                TestData.Groceries(february, groceries, sortOrder: 1));
            await db.SaveChangesAsync();
        }

        await using var read = sql.ContextFor(user);

        var snapshots = await new CategoryRepository(read).ListForAllCyclesAsync();

        snapshots.Should().HaveCount(3);
        snapshots.Select(s => s.Name).Should().NotContain("Theirs");
        snapshots.Where(s => s.CycleId == january.Id).Select(s => s.SortOrder).Should().Equal(1, 2);
    }
}
