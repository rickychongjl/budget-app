using Budget.Domain;
using Budget.Jobs;
using Microsoft.EntityFrameworkCore;

namespace Budget.Infrastructure.Tests;

// The job's per-user loop against the real database: the tenant filter stays on, and each user is processed as themselves.
[Collection(SqlServerCollection.Name)]
public sealed class RolloverJobTests(SqlServerFixture sql)
{
    [Fact]
    public async Task One_run_rolls_every_user_forward_as_themselves_and_skips_a_draft()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var (behind, alsoBehind, draftOnly) = (await sql.NewUserAsync(), await sql.NewUserAsync(), await sql.NewUserAsync());
        foreach (var user in new[] { behind, alsoBehind })
        {
            await using var db = sql.ContextFor(user);
            var cycle = TestData.Confirmed(user, today.AddDays(-100));
            db.AddRange(cycle, new Category(user.Id, CategoryType.Debit, TestData.Now));
            await db.SaveChangesAsync();
            db.Add(TestData.Groceries(cycle, await db.Categories.SingleAsync()));
            await db.SaveChangesAsync();
        }

        await using (var db = sql.ContextFor(draftOnly))
        {
            db.Add(new Cycle(draftOnly.Id, today.AddDays(-100)));
            await db.SaveChangesAsync();
        }

        await using var services = JobHost.BuildServices(sql.ConnectionString);

        var exitCode = await JobHost.RolloverAsync(services);

        exitCode.Should().Be(0);
        foreach (var user in new[] { behind, alsoBehind })
        {
            await using var db = sql.ContextFor(user);
            var cycles = await db.Cycles.OrderBy(c => c.StartDate).ToListAsync();
            cycles.Should().HaveCount(4).And.OnlyContain(c => c.UserId == user.Id);
            cycles[^1].Covers(today.AddDays(-1)).Should().BeTrue("the newest cycle reaches today, give or take the time zone");
            (await db.CycleCategories.CountAsync()).Should().Be(4, "each new cycle copies the category");
        }

        await using var draft = sql.ContextFor(draftOnly);
        (await draft.Cycles.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task An_auto_pay_bill_is_paid_once_in_each_new_cycle_however_often_the_job_runs()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var user = await sql.NewUserAsync();
        await using (var db = sql.ContextFor(user))
        {
            var cycle = TestData.Confirmed(user, today.AddDays(-40));
            var category = new Category(user.Id, CategoryType.Debit, TestData.Now);
            db.AddRange(cycle, category);
            await db.SaveChangesAsync();
            db.Add(new CycleCategory(cycle, category.Id, "Rent", "house", "slate", 0, 2200m, spreadEvenly: false, autoPay: true));
            await db.SaveChangesAsync();
        }

        await using var services = JobHost.BuildServices(sql.ConnectionString);
        await JobHost.RolloverAsync(services);
        await JobHost.RolloverAsync(services);

        await using var read = sql.ContextFor(user);
        var latest = await read.Cycles.OrderBy(c => c.StartDate).LastAsync();
        var payment = await read.Transactions.SingleAsync();
        (payment.CycleId, payment.Amount, payment.OccurredOn, payment.Note).Should().Be((latest.Id, 2200m, latest.StartDate, "Auto-paid"));
    }
}
