using Budget.Domain;
using Microsoft.Extensions.Logging;

namespace Budget.Application.Tests;

public sealed class CyclesTests
{
    private static readonly DateOnly Jan1 = new(2026, 1, 1);
    private readonly FakeStore _store = new();
    private readonly ListLogger<Cycles> _log = new();

    private Cycles At(int year, int month, int day)
    {
        var clock = new FixedClock(new DateTimeOffset(year, month, day, 1, 0, 0, TimeSpan.Zero));
        var today = new UserToday(_store, _store, clock);
        return new Cycles(_store, _store, _store, today, new RolloverCycles(_store, _store, today, _store), _log);
    }

    private Cycle Confirmed(User user, DateOnly start)
    {
        var cycle = new Cycle(user.Id, start);
        cycle.Confirm();
        _store.Cycles.Add(cycle);
        return cycle;
    }

    [Fact]
    public async Task List_is_oldest_first_with_each_cycles_phase()
    {
        var user = _store.SignIn();
        var first = Confirmed(user, Jan1);
        _store.Cycles.Add(first.CreateNext());
        _store.Cycles.Add(_store.Cycles[^1].CreateNext());

        var list = await At(2026, 2, 10).ListAsync();

        list.Select(c => (c.StartDate, c.EndDate, c.Phase)).Should().Equal(
            (Jan1, new DateOnly(2026, 1, 30), CyclePhase.Past),
            (new DateOnly(2026, 1, 31), new DateOnly(2026, 3, 1), CyclePhase.Current),
            (new DateOnly(2026, 3, 2), new DateOnly(2026, 3, 31), CyclePhase.Future));
    }

    [Fact]
    public async Task Get_returns_the_cycle_with_its_rollup()
    {
        var user = _store.SignIn();
        var cycle = Confirmed(user, Jan1);
        var groceries = new Category(user.Id, CategoryType.Debit, DateTimeOffset.UnixEpoch);
        _store.Categories.Add(groceries);
        _store.CycleCategories.Add(new CycleCategory(cycle, groceries.Id, "Groceries", "shopping-cart", "blue", 0, 600m));
        _store.Transactions.Add(new Transaction(cycle, groceries.Id, 650m, Jan1, null, Guid.NewGuid(), DateTimeOffset.UnixEpoch));

        var summary = await At(2026, 1, 10).GetAsync(cycle.Id);

        summary.Cycle.Should().Be(new CycleDto(cycle.Id, Jan1, new DateOnly(2026, 1, 30), CycleStatus.Confirmed, CyclePhase.Current, null, null));
        summary.Rollup.DebitsActual.Should().Be(650m);
        summary.Rollup.Categories.Should().ContainSingle().Which.Status.Should().Be(RollupStatus.Over);
    }

    [Fact]
    public async Task Get_for_an_unknown_or_another_users_cycle_is_not_found()
    {
        var theirs = Confirmed(_store.SignIn(), Jan1);
        _store.SignIn();

        var get = () => At(2026, 1, 10).GetAsync(theirs.Id);

        (await get.Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("cycle.not-found");
    }

    [Fact]
    public async Task Current_is_returned_without_a_warning_when_the_job_has_kept_up()
    {
        var cycle = Confirmed(_store.SignIn(), Jan1);

        var current = await At(2026, 1, 10).GetCurrentAsync();

        current.Cycle.Id.Should().Be(cycle.Id);
        _log.Entries.Should().BeEmpty();
    }

    [Fact]
    public async Task Current_rolls_over_first_and_warns_when_the_job_had_fallen_behind()
    {
        Confirmed(_store.SignIn(), Jan1);

        var current = await At(2026, 2, 10).GetCurrentAsync();

        current.Cycle.StartDate.Should().Be(new DateOnly(2026, 1, 31));
        current.Cycle.Phase.Should().Be(CyclePhase.Current);
        _log.Entries.Should().ContainSingle().Which.Level.Should().Be(LogLevel.Warning);
    }

    [Fact]
    public async Task Current_before_onboarding_is_not_found()
    {
        _store.SignIn();

        var get = () => At(2026, 1, 10).GetCurrentAsync();

        (await get.Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("cycle.none");
    }
}

internal sealed class ListLogger<T> : ILogger<T>
{
    public List<(LogLevel Level, string Message)> Entries { get; } = [];

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
    public bool IsEnabled(LogLevel logLevel) => true;
    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
        Entries.Add((logLevel, formatter(state, exception)));
}
