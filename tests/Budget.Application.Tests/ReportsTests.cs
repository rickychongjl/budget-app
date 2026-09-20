using Budget.Domain;
using Microsoft.Extensions.Logging;

namespace Budget.Application.Tests;

public sealed class ReportsTests
{
    private static readonly DateOnly Jan1 = new(2026, 1, 1);
    private readonly FakeStore _store = new();

    private UserToday Today(int year, int month, int day) =>
        new(_store, _store, new FixedClock(new DateTimeOffset(year, month, day, 1, 0, 0, TimeSpan.Zero)));

    private Reports At(int year, int month, int day) =>
        new(_store, _store, new CycleFinder(_store, Today(year, month, day)));

    // The same data through the single-cycle endpoint, to compare against.
    private Cycles CyclesAt(int year, int month, int day)
    {
        var today = Today(year, month, day);
        return new Cycles(_store, _store, _store, _store, _store, new CycleFinder(_store, today), new RolloverCycles(_store, _store, today, _store), new ListLogger<Cycles>());
    }

    private Cycle Confirmed(User user, DateOnly start)
    {
        var cycle = new Cycle(user.Id, start);
        cycle.Confirm();
        _store.Cycles.Add(cycle);
        return cycle;
    }

    private Guid Category(User user, Cycle cycle, string name, CategoryType type, decimal budget, int sortOrder = 0)
    {
        var category = _store.Categories.SingleOrDefault(c => c.UserId == user.Id && _store.CycleCategories.Any(cc => cc.CategoryId == c.Id && cc.Name == name));
        if (category is null)
        {
            category = new Category(user.Id, type, DateTimeOffset.UnixEpoch);
            _store.Categories.Add(category);
        }

        _store.CycleCategories.Add(new CycleCategory(cycle, category.Id, name, "shopping-cart", "blue", sortOrder, budget));
        return category.Id;
    }

    private void Spend(Cycle cycle, Guid categoryId, decimal amount) =>
        _store.Transactions.Add(new Transaction(cycle, categoryId, amount, cycle.StartDate, null, Guid.NewGuid(), DateTimeOffset.UnixEpoch));

    [Fact]
    public async Task Report_is_oldest_first()
    {
        var user = _store.SignIn();
        var first = Confirmed(user, Jan1);
        var second = first.CreateNext();
        _store.Cycles.Add(second);
        _store.Cycles.Insert(0, second.CreateNext());

        var report = await At(2026, 2, 10).ListAsync();

        report.Select(r => r.Cycle.StartDate).Should().BeInAscendingOrder().And.HaveCount(3);
    }

    // The property that keeps the two endpoints honest: the report is GET /api/cycles/{id} once per cycle.
    [Fact]
    public async Task Each_element_matches_the_single_cycle_endpoint()
    {
        var user = _store.SignIn();
        var january = Confirmed(user, Jan1);
        var february = january.CreateNext();
        _store.Cycles.Add(february);

        var groceries = Category(user, january, "Groceries", CategoryType.Debit, 600m, 1);
        var salary = Category(user, january, "Salary", CategoryType.Credit, 3000m, 2);
        Category(user, february, "Groceries", CategoryType.Debit, 700m, 1);
        Spend(january, groceries, 650m);
        Spend(january, groceries, -50m);
        Spend(january, salary, 3100m);
        Spend(february, groceries, 20m);

        var report = await At(2026, 2, 10).ListAsync();

        var cycles = CyclesAt(2026, 2, 10);
        foreach (var element in report)
        {
            element.Should().BeEquivalentTo(await cycles.GetAsync(element.Cycle.Id));
        }
    }

    [Fact]
    public async Task Accrued_comes_from_the_balances()
    {
        var user = _store.SignIn();
        var cycle = Confirmed(user, Jan1);
        new CycleTimeline([cycle]).SetOpeningBalance(cycle, 1000m, Jan1);

        (await At(2026, 1, 10).ListAsync()).Single().Rollup.Accrued.Should().BeNull();

        new CycleTimeline([cycle]).SetClosingBalance(cycle, 1250m, new DateOnly(2026, 2, 10));

        (await At(2026, 2, 10).ListAsync()).Single().Rollup.Accrued.Should().Be(250m);
    }

    [Fact]
    public async Task A_draft_only_user_gets_their_draft_with_no_actuals()
    {
        var user = _store.SignIn();
        var draft = new Cycle(user.Id, Jan1);
        _store.Cycles.Add(draft);
        Category(user, draft, "Groceries", CategoryType.Debit, 600m);

        var element = (await At(2026, 1, 10).ListAsync()).Should().ContainSingle().Subject;

        element.Cycle.Status.Should().Be(CycleStatus.Draft);
        element.Rollup.DebitsActual.Should().Be(0m);
        element.Rollup.Categories.Should().ContainSingle().Which.Budgeted.Should().Be(600m);
    }

    [Fact]
    public async Task No_cycles_gives_an_empty_report()
    {
        _store.SignIn();

        (await At(2026, 1, 10).ListAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task Another_users_cycles_and_transactions_are_never_counted()
    {
        var other = _store.SignIn();
        var theirs = Confirmed(other, Jan1);
        var theirCategory = Category(other, theirs, "Theirs", CategoryType.Debit, 100m);
        Spend(theirs, theirCategory, 90m);

        var mine = _store.SignIn();
        var ours = Confirmed(mine, Jan1);
        var ourCategory = Category(mine, ours, "Ours", CategoryType.Debit, 100m);
        Spend(ours, ourCategory, 10m);

        var element = (await At(2026, 1, 10).ListAsync()).Should().ContainSingle().Subject;

        element.Cycle.Id.Should().Be(ours.Id);
        element.Rollup.DebitsActual.Should().Be(10m);
        element.Rollup.Categories.Should().ContainSingle().Which.Name.Should().Be("Ours");
    }

    // Rollover has exactly two triggers (the job and GET /api/cycles/current); the report must not be a third.
    [Fact]
    public async Task Report_never_creates_a_cycle()
    {
        var user = _store.SignIn();
        Confirmed(user, Jan1);

        var report = await At(2026, 6, 1).ListAsync();

        report.Should().ContainSingle();
        _store.Cycles.Should().ContainSingle();
        _store.Saves.Should().Be(0);
    }
}
