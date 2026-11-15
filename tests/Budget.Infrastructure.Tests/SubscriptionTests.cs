using Budget.Application;
using Budget.Domain;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Budget.Infrastructure.Tests;

// The Subscription table is a tenant table like the others: filtered, stamped, guarded, and removed with the user's data.
[Collection(SqlServerCollection.Name)]
public class SubscriptionTests(SqlServerFixture sql)
{
    private static readonly DateTimeOffset PeriodEnd = new(2026, 2, 10, 0, 0, 0, TimeSpan.Zero);

    private static Subscription AppStore(User user, string externalId = "2000000001") =>
        new(user.Id, SubscriptionSource.AppStore, externalId, SubscriptionStatus.Trialing, PeriodEnd, PeriodEnd, TestData.Now);

    private async Task<Subscription> SeedAsync(User user, Subscription? subscription = null)
    {
        subscription ??= AppStore(user);
        await using var db = sql.ContextFor(user);
        new SubscriptionRepository(db).Add(subscription);
        await db.SaveChangesAsync();
        return subscription;
    }

    [Fact]
    public async Task A_subscription_round_trips_and_is_stored_as_codes()
    {
        var user = await sql.NewUserAsync();
        var subscription = AppStore(user);
        subscription.Update(SubscriptionStatus.PastDue, PeriodEnd.AddDays(30), null, cancelAtPeriodEnd: true, TestData.Now.AddDays(1));
        await SeedAsync(user, subscription);

        await using var db = sql.ContextFor(user);
        var read = (await new SubscriptionRepository(db).ListAsync()).Should().ContainSingle().Subject;

        read.Should().BeEquivalentTo(subscription);
        var stored = await db.Database
            .SqlQuery<string>($"SELECT [Source] + '|' + [Status] + '|' + [Plan] AS [Value] FROM [Subscription] WHERE [Id] = {subscription.Id}")
            .SingleAsync();
        stored.Should().Be("app_store|past_due|premium");
    }

    [Fact]
    public async Task A_manual_grant_needs_no_external_id_or_dates()
    {
        var user = await sql.NewUserAsync();
        var grant = new Subscription(user.Id, SubscriptionSource.Manual, null, SubscriptionStatus.Active, null, null, TestData.Now);
        await SeedAsync(user, grant);
        await SeedAsync(user, new Subscription(user.Id, SubscriptionSource.Manual, null, SubscriptionStatus.Active, null, null, TestData.Now));

        await using var db = sql.ContextFor(user);
        (await new SubscriptionRepository(db).ListAsync()).Should().HaveCount(2);
    }

    [Fact]
    public async Task Another_user_sees_none_of_them()
    {
        var owner = await sql.NewUserAsync();
        await SeedAsync(owner);
        var stranger = await sql.NewUserAsync();

        await using var db = sql.ContextFor(stranger);

        (await new SubscriptionRepository(db).ListAsync()).Should().BeEmpty();
        (await db.Subscriptions.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task A_subscription_for_another_user_cannot_be_written()
    {
        var owner = await sql.NewUserAsync();
        var stranger = await sql.NewUserAsync();

        await using (var db = sql.ContextFor(stranger))
        {
            db.Subscriptions.Add(AppStore(owner));
            await db.Invoking(x => x.SaveChangesAsync()).Should().ThrowAsync<InvalidOperationException>();
        }

        await using var asOwner = sql.ContextFor(owner);
        (await asOwner.Subscriptions.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Updating_another_users_attached_subscription_throws()
    {
        var owner = await sql.NewUserAsync();
        var subscription = await SeedAsync(owner);
        var stranger = await sql.NewUserAsync();

        await using var db = sql.ContextFor(stranger);
        db.Attach(subscription);
        subscription.Update(SubscriptionStatus.Active, PeriodEnd.AddYears(10), null, false, TestData.Now);

        await db.Invoking(x => x.SaveChangesAsync()).Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task The_same_store_subscription_is_one_row()
    {
        var user = await sql.NewUserAsync();
        await SeedAsync(user);

        await using var db = sql.ContextFor(user);
        db.Subscriptions.Add(AppStore(user));

        await db.Invoking(x => x.SaveChangesAsync()).Should().ThrowAsync<ConflictException>();
    }

    [Theory]
    [InlineData("stripe", "active", "premium")]
    [InlineData("app_store", "Active", "premium")]
    [InlineData("app_store", "active", "free")]
    public async Task The_database_refuses_an_unknown_code(string source, string status, string plan)
    {
        var user = await sql.NewUserAsync();
        await using var db = sql.ContextFor(user);

        var insert = () => db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO [Subscription] ([Id], [UserId], [Source], [ExternalId], [Status], [Plan], [CancelAtPeriodEnd], [CreatedAt], [UpdatedAt])
            VALUES ({Guid.NewGuid()}, {user.Id}, {source}, NULL, {status}, {plan}, 0, {TestData.Now}, {TestData.Now})
            """);

        await insert.Should().ThrowAsync<SqlException>();
    }

    [Fact]
    public async Task Deleting_a_users_data_removes_their_subscriptions_and_only_theirs()
    {
        var owner = await sql.NewUserAsync();
        var bystander = await sql.NewUserAsync();
        await SeedAsync(owner);
        await SeedAsync(bystander);

        await using (var db = sql.ContextFor(bystander))
        {
            await new UserRepository(db).DeleteDataAsync(owner.Id);
        }

        await using (var check = sql.ContextFor(owner))
        {
            (await check.Subscriptions.CountAsync()).Should().Be(1, "deleting as someone else deletes nothing");
        }

        await using (var db = sql.ContextFor(owner))
        {
            await new UserRepository(db).DeleteDataAsync(owner.Id);
            (await db.Subscriptions.AnyAsync()).Should().BeFalse();
        }

        await using var other = sql.ContextFor(bystander);
        (await other.Subscriptions.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Entitlements_read_the_users_subscription_from_the_database()
    {
        var user = await sql.NewUserAsync();
        await SeedAsync(user);

        await using var db = sql.ContextFor(user);
        var entitlements = new Entitlements(
            new TestUser(user.Id), new UserRepository(db), new SubscriptionRepository(db), new PlanSettings(), new FixedTime(PeriodEnd.AddDays(-1)));

        (await entitlements.GetAsync()).Should().Be(new Entitlement(Plan.Premium, PremiumSource.Subscription));
    }

    private sealed class FixedTime(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
