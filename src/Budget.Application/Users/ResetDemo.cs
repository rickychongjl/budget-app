using Budget.Domain;

namespace Budget.Application;

// Puts the shared demo user back to the fixture: everything visitors left is deleted, then the history is rebuilt through
// the same domain rules real use goes through. The caller's scope must be running as the demo user; as anyone else the
// tenant filter makes the delete a no-op and the write guard refuses the inserts.
public sealed class ResetDemo(
    IUserRepository users,
    ICycleRepository cycles,
    ICategoryRepository categories,
    ITransactionRepository transactions,
    IUnitOfWork unitOfWork,
    TimeProvider clock)
{
    // For migrate: a first deploy, or a fresh local database, should not show an empty demo until the nightly job.
    public async Task SeedIfEmptyAsync(DemoFixture fixture, CancellationToken ct = default)
    {
        if ((await cycles.ListAsync(ct)).Count == 0)
        {
            await RunAsync(fixture, ct);
        }
    }

    // The demo as a first sign-in finds it: no cycles, no categories, nothing. What the onboarding specs start from.
    public async Task<User> ClearAsync(CancellationToken ct = default)
    {
        var demo = await users.GetDemoAsync(ct) ?? throw new NotFoundException("demo.unavailable", "The demo is not available.");
        await users.DeleteDataAsync(demo.Id, ct);
        return demo;
    }

    // ponytail: the delete and the rebuild are not one transaction. If the rebuild fails the demo is empty until the
    // next run; the job exits non-zero so it is noticed. Wrap both in a transaction if that ever happens in practice.
    public async Task RunAsync(DemoFixture fixture, CancellationToken ct = default)
    {
        var demo = await ClearAsync(ct);

        var now = clock.GetUtcNow();
        var today = demo.Today(clock);

        // The first cycle is set up as a draft, like onboarding, then rolled forward to today like the rollover job does.
        var first = new Cycle(demo.Id, today.AddDays(fixture.FirstCycleStartOffset));
        var timeline = new CycleTimeline([first]);
        timeline.SetOpeningBalance(first, fixture.OpeningBalance, today);

        var categoryIds = new Dictionary<string, Guid>();
        var firstCategories = new List<CycleCategory>();
        foreach (var seed in fixture.Categories)
        {
            var category = new Category(demo.Id, seed.Type, now);
            categories.Add(category);
            categoryIds.Add(seed.Key, category.Id);
            firstCategories.Add(new CycleCategory(first, category.Id, seed.Name, seed.Icon, seed.Colour, firstCategories.Count, seed.Budget, seed.SpreadEvenly));
        }

        first.Confirm();
        var rolled = timeline.RollForward(today, firstCategories);

        // Each closing balance carries into the next cycle's opening balance.
        foreach (var (cycle, closing) in timeline.Cycles.Zip(fixture.ClosingBalances))
        {
            timeline.SetClosingBalance(cycle, closing, today);
        }

        foreach (var cycle in timeline.Cycles)
        {
            cycles.Add(cycle);
        }

        foreach (var cycleCategory in firstCategories.Concat(rolled.Categories))
        {
            categories.Add(cycleCategory);
        }

        foreach (var seed in fixture.Transactions)
        {
            var on = today.AddDays(seed.DayOffset);
            var cycle = timeline.Cycles.First(c => c.Covers(on));
            transactions.Add(new Transaction(cycle, categoryIds[seed.Category], seed.Amount, on, seed.Note, Guid.NewGuid(), now));
        }

        await unitOfWork.SaveChangesAsync(ct);
    }
}
