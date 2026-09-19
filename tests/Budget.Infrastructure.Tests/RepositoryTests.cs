using Budget.Domain;

namespace Budget.Infrastructure.Tests;

[Collection(SqlServerCollection.Name)]
public class RepositoryTests(SqlServerFixture sql)
{
    [Fact]
    public async Task Users_are_found_by_id_and_external_id_and_listed_across_tenants()
    {
        var externalId = Guid.NewGuid().ToString();
        var user = await sql.NewUserAsync(externalId);
        var other = await sql.NewUserAsync();

        // As `other`: the user table is deliberately not tenant-filtered.
        await using var db = sql.ContextFor(other);
        var users = new UserRepository(db);

        (await users.GetAsync(user.Id))!.Id.Should().Be(user.Id);
        (await users.GetByExternalIdAsync(externalId))!.Id.Should().Be(user.Id);
        (await users.GetByExternalIdAsync("nobody")).Should().BeNull();
        (await users.ListAsync()).Select(u => u.Id).Should().Contain([user.Id, other.Id]);
    }

    [Fact]
    public async Task A_user_added_through_the_repository_is_saved_by_the_unit_of_work()
    {
        var user = new User("New", "Australia/Sydney", "AUD", TestData.Now);

        await using (var db = sql.NoUser())
        {
            new UserRepository(db).Add(user);
            await db.SaveChangesAsync();
        }

        await using var read = sql.NoUser();
        (await new UserRepository(read).GetAsync(user.Id)).Should().BeEquivalentTo(user);
    }

    [Fact]
    public async Task Cycles_are_listed_oldest_first_and_only_for_the_current_user()
    {
        var user = await sql.NewUserAsync();
        var stranger = await sql.NewUserAsync();
        var first = TestData.Confirmed(user);
        var second = first.CreateNext();

        await using (var db = sql.ContextFor(user))
        {
            var cycles = new CycleRepository(db);
            cycles.Add(second);
            cycles.Add(first);
            await db.SaveChangesAsync();
        }

        await using (var db = sql.ContextFor(user))
        {
            var cycles = new CycleRepository(db);
            (await cycles.ListAsync()).Select(c => c.Id).Should().Equal(first.Id, second.Id);
            (await cycles.GetAsync(second.Id))!.StartDate.Should().Be(second.StartDate);
        }

        await using var asStranger = sql.ContextFor(stranger);
        (await new CycleRepository(asStranger).ListAsync()).Should().BeEmpty();
        (await new CycleRepository(asStranger).GetAsync(first.Id)).Should().BeNull();
    }

    [Fact]
    public async Task Categories_and_their_cycle_snapshots()
    {
        var user = await sql.NewUserAsync();
        var cycle = TestData.Confirmed(user);
        var next = cycle.CreateNext();
        var food = new Category(user.Id, CategoryType.Debit, TestData.Now);
        var pay = new Category(user.Id, CategoryType.Credit, TestData.Now.AddMinutes(1));

        await using (var db = sql.ContextFor(user))
        {
            new CycleRepository(db).Add(cycle);
            new CycleRepository(db).Add(next);
            var categories = new CategoryRepository(db);
            categories.Add(food);
            categories.Add(pay);
            categories.Add(TestData.Groceries(cycle, food, sortOrder: 2));
            categories.Add(TestData.Groceries(cycle, pay, sortOrder: 1, name: "Salary"));
            categories.Add(TestData.Groceries(next, food));
            await db.SaveChangesAsync();
        }

        await using (var db = sql.ContextFor(user))
        {
            var categories = new CategoryRepository(db);

            (await categories.ListAsync()).Select(c => c.Id).Should().Equal(food.Id, pay.Id);
            (await categories.GetAsync(pay.Id))!.Type.Should().Be(CategoryType.Credit);
            (await categories.ListForCycleAsync(cycle.Id)).Select(c => c.Name).Should().Equal("Salary", "Groceries");
            (await categories.GetForCycleAsync(next.Id, pay.Id)).Should().BeNull();

            categories.Remove((await categories.GetForCycleAsync(cycle.Id, pay.Id))!);
            await db.SaveChangesAsync();
        }

        await using var read = sql.ContextFor(user);
        (await new CategoryRepository(read).ListForCycleAsync(cycle.Id)).Should().ContainSingle();
    }

    [Fact]
    public async Task Transactions_for_a_cycle()
    {
        var user = await sql.NewUserAsync();
        var cycle = TestData.Confirmed(user);
        var next = cycle.CreateNext();
        var food = new Category(user.Id, CategoryType.Debit, TestData.Now);
        var fuel = new Category(user.Id, CategoryType.Debit, TestData.Now);
        Transaction On(Cycle c, Category category, int day, int minute = 0) =>
            new(c, category.Id, 5m, TestData.Jan1.AddDays(day), null, Guid.NewGuid(), TestData.Now.AddMinutes(minute));

        var early = On(cycle, food, day: 1);
        var late = On(cycle, fuel, day: 9);
        var sameDayLater = On(cycle, food, day: 9, minute: 5);
        var elsewhere = On(next, food, day: 40);

        await using (var db = sql.ContextFor(user))
        {
            db.AddRange(cycle, next, food, fuel);
            db.AddRange(TestData.Groceries(cycle, food), TestData.Groceries(cycle, fuel, 1, "Fuel"), TestData.Groceries(next, food));
            var transactions = new TransactionRepository(db);
            foreach (var t in new[] { early, late, sameDayLater, elsewhere })
            {
                transactions.Add(t);
            }

            await db.SaveChangesAsync();
        }

        await using (var db = sql.ContextFor(user))
        {
            var transactions = new TransactionRepository(db);

            (await transactions.ListForCycleAsync(cycle.Id)).Select(t => t.Id).Should().Equal(sameDayLater.Id, late.Id, early.Id);
            (await transactions.ListForCycleAsync(cycle.Id, food.Id)).Select(t => t.Id).Should().Equal(sameDayLater.Id, early.Id);
            (await transactions.GetAsync(elsewhere.Id))!.CycleId.Should().Be(next.Id);
            (await transactions.GetByClientIdAsync(late.ClientId))!.Id.Should().Be(late.Id);
            (await transactions.GetByClientIdAsync(Guid.NewGuid())).Should().BeNull();
            (await transactions.AnyForCategoryAsync(cycle.Id, fuel.Id)).Should().BeTrue();
            (await transactions.AnyForCategoryAsync(next.Id, fuel.Id)).Should().BeFalse();
            (await transactions.CountAsync()).Should().Be(4);
            await using (var nobodyElse = sql.ContextFor(await sql.NewUserAsync()))
            {
                (await new TransactionRepository(nobodyElse).CountAsync()).Should().Be(0);
            }

            transactions.Remove((await transactions.GetAsync(late.Id))!);
            await db.SaveChangesAsync();
            (await transactions.AnyForCategoryAsync(cycle.Id, fuel.Id)).Should().BeFalse();
        }
    }
}
