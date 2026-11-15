using System.Data.Common;
using System.Reflection;
using Budget.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Budget.Infrastructure.Tests;

// Account deletion against the real database: the foreign keys, the tenant filter and the transaction.
[Collection(SqlServerCollection.Name)]
public sealed class DeleteAccountTests(SqlServerFixture sql)
{
    private async Task SeedAsync(User user)
    {
        var cycle = TestData.Confirmed(user);
        var category = new Category(user.Id, CategoryType.Debit, TestData.Now);
        await using var db = sql.ContextFor(user);
        db.AddRange(cycle, category, TestData.Groceries(cycle, category), new Transaction(cycle, category.Id, 10m, TestData.Jan1, "mine", Guid.NewGuid(), TestData.Now),
            new Subscription(user.Id, SubscriptionSource.AppStore, "txn-" + Guid.NewGuid(), SubscriptionStatus.Active, TestData.Now.AddDays(30), null, TestData.Now));
        await db.SaveChangesAsync();
    }

    // Every table with a UserId, read from the model rather than listed, so a tenant table added later (and forgotten in
    // DeleteDataAsync) fails here. Each is counted through a context running as the given user: the tenant filter is
    // what limits the count to that user's rows, with no raw SQL and no IgnoreQueryFilters.
    private async Task<Dictionary<string, int>> TenantRowsAsync(Guid userId)
    {
        await using var db = sql.ContextFor(userId);
        var counts = new Dictionary<string, int>();
        foreach (var type in db.Model.GetEntityTypes().Where(t => t.FindProperty(nameof(Cycle.UserId)) is not null))
        {
            var count = (Task<int>)CountMethod.MakeGenericMethod(type.ClrType).Invoke(null, [db])!;
            counts[type.GetTableName()!] = await count;
        }

        return counts;
    }

    private static readonly MethodInfo CountMethod = typeof(DeleteAccountTests).GetMethod(nameof(Count), BindingFlags.NonPublic | BindingFlags.Static)!;

    private static Task<int> Count<T>(BudgetDbContext db) where T : class => db.Set<T>().CountAsync();

    private async Task<bool> UserExistsAsync(Guid userId)
    {
        await using var db = sql.NoUser();
        return await db.Users.AnyAsync(u => u.Id == userId);
    }

    [Fact]
    public async Task No_tenant_table_keeps_a_row_for_the_deleted_user_and_other_users_are_untouched()
    {
        var (user, bystander) = (await sql.NewUserAsync(), await sql.NewUserAsync());
        await SeedAsync(user);
        await SeedAsync(bystander);
        var bystanderBefore = await TenantRowsAsync(bystander.Id);
        var userBefore = await TenantRowsAsync(user.Id);
        userBefore.Should().ContainKeys("Cycle", "Category", "CycleCategory", "Transaction", "Subscription");
        userBefore.Values.Should().OnlyContain(n => n > 0, "otherwise this test would prove nothing for that table");

        await using (var db = sql.ContextFor(user))
        {
            await new UserRepository(db).DeleteAccountAsync(user.Id);
        }

        (await TenantRowsAsync(user.Id)).Values.Should().OnlyContain(n => n == 0);
        (await UserExistsAsync(user.Id)).Should().BeFalse();
        (await TenantRowsAsync(bystander.Id)).Should().BeEquivalentTo(bystanderBefore);
        (await UserExistsAsync(bystander.Id)).Should().BeTrue();
    }

    [Fact]
    public async Task Deleting_an_account_that_is_already_gone_is_not_an_error()
    {
        var user = await sql.NewUserAsync();
        await SeedAsync(user);
        await using (var db = sql.ContextFor(user))
        {
            await new UserRepository(db).DeleteAccountAsync(user.Id);
        }

        await using var again = sql.ContextFor(user);
        await new UserRepository(again).Invoking(r => r.DeleteAccountAsync(user.Id)).Should().NotThrowAsync();
    }

    [Fact]
    public async Task A_failure_on_the_user_row_rolls_the_data_back_too()
    {
        var user = await sql.NewUserAsync();
        await SeedAsync(user);
        var before = await TenantRowsAsync(user.Id);

        var failure = new FailUserDelete();
        await using (var db = sql.ContextFor(user, failure))
        {
            await new UserRepository(db).Invoking(r => r.DeleteAccountAsync(user.Id)).Should().ThrowAsync<Exception>();
        }

        failure.Fired.Should().BeTrue("the failure must come from the User delete, after the data deletes ran");

        (await TenantRowsAsync(user.Id)).Should().BeEquivalentTo(before);
        (await UserExistsAsync(user.Id)).Should().BeTrue();
    }

    // As anyone else the tenant filter would delete none of the owner's rows, and the unfiltered User delete would then
    // remove a stranger's account. The repository refuses before sending anything.
    [Fact]
    public async Task Deleting_someone_elses_account_is_refused_and_deletes_nothing()
    {
        var (owner, other) = (await sql.NewUserAsync(), await sql.NewUserAsync());
        var empty = await sql.NewUserAsync();
        await SeedAsync(owner);
        var before = await TenantRowsAsync(owner.Id);

        await using (var db = sql.ContextFor(other))
        {
            var repository = new UserRepository(db);
            await repository.Invoking(r => r.DeleteAccountAsync(owner.Id)).Should().ThrowAsync<InvalidOperationException>();
            await repository.Invoking(r => r.DeleteAccountAsync(empty.Id)).Should().ThrowAsync<InvalidOperationException>();
        }

        await using (var db = sql.NoUser())
        {
            await new UserRepository(db).Invoking(r => r.DeleteAccountAsync(owner.Id)).Should().ThrowAsync<InvalidOperationException>();
        }

        (await TenantRowsAsync(owner.Id)).Should().BeEquivalentTo(before);
        (await UserExistsAsync(owner.Id)).Should().BeTrue();
        (await UserExistsAsync(empty.Id)).Should().BeTrue();
    }

    // Fails the last statement, after every tenant delete has already run inside the transaction.
    private sealed class FailUserDelete : DbCommandInterceptor
    {
        public bool Fired { get; private set; }

        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<int> result, CancellationToken ct = default)
        {
            if (command.CommandText.Contains("[User] AS", StringComparison.Ordinal))
            {
                Fired = true;
                throw new InvalidOperationException("simulated");
            }

            return base.NonQueryExecutingAsync(command, eventData, result, ct);
        }
    }
}
