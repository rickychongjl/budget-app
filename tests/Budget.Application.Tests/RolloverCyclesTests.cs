using Budget.Domain;

namespace Budget.Application.Tests;

public sealed class RolloverCyclesTests
{
    private static readonly DateOnly Jan1 = new(2026, 1, 1);
    private readonly FakeStore _store = new();

    private RolloverCycles At(int year, int month, int day, int hourUtc = 12) =>
        new(_store, _store, new UserToday(_store, _store, new FixedClock(new DateTimeOffset(year, month, day, hourUtc, 0, 0, TimeSpan.Zero))), _store);

    private Cycle ConfirmedCycle(User user, DateOnly start)
    {
        var cycle = new Cycle(user.Id, start);
        cycle.Confirm();
        _store.Cycles.Add(cycle);
        return cycle;
    }

    [Fact]
    public async Task Nothing_due_creates_nothing_and_does_not_save()
    {
        ConfirmedCycle(_store.SignIn(), Jan1);

        var created = await At(2026, 1, 15).RunAsync();

        created.Should().Be(0);
        _store.Cycles.Should().HaveCount(1);
        _store.Saves.Should().Be(0);
    }

    [Fact]
    public async Task Every_missed_cycle_is_created_with_the_categories_copied_in_one_save()
    {
        var user = _store.SignIn();
        var first = ConfirmedCycle(user, Jan1);
        _store.CycleCategories.Add(new CycleCategory(first, Guid.NewGuid(), "Groceries", "shopping-cart", "blue", 0, 600m));
        _store.CycleCategories.Add(new CycleCategory(first, Guid.NewGuid(), "Salary", "banknote", "green", 1, 5000m));

        var created = await At(2026, 4, 5).RunAsync();

        created.Should().Be(3);
        _store.Cycles.Select(c => c.StartDate).Should().Equal(Jan1, new(2026, 1, 31), new(2026, 3, 2), new(2026, 4, 1));
        _store.Cycles.Should().OnlyContain(c => c.Status == CycleStatus.Confirmed);
        _store.CycleCategories.Where(c => c.CycleId == _store.Cycles[^1].Id).Select(c => (c.Name, c.BudgetAmount))
            .Should().BeEquivalentTo([("Groceries", 600m), ("Salary", 5000m)]);
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task Running_twice_is_the_same_as_running_once()
    {
        ConfirmedCycle(_store.SignIn(), Jan1);

        await At(2026, 2, 5).RunAsync();
        var second = await At(2026, 2, 5).RunAsync();

        second.Should().Be(0);
        _store.Cycles.Should().HaveCount(2);
    }

    [Fact]
    public async Task A_user_whose_only_cycle_is_a_draft_is_skipped()
    {
        _store.Cycles.Add(new Cycle(_store.SignIn().Id, Jan1));

        var created = await At(2026, 6, 1).RunAsync();

        created.Should().Be(0);
        _store.Cycles.Should().HaveCount(1);
    }

    [Fact]
    public async Task A_user_with_no_cycles_is_skipped()
    {
        _store.SignIn();

        (await At(2026, 6, 1).RunAsync()).Should().Be(0);
    }

    [Theory]
    [InlineData("Australia/Sydney", 1)] // 14:00 UTC on 30 Jan is already 31 Jan in Sydney
    [InlineData("Etc/UTC", 0)]
    public async Task Today_is_the_users_local_date(string timeZone, int expected)
    {
        ConfirmedCycle(_store.SignIn(timeZone), Jan1);

        var created = await At(2026, 1, 30, hourUtc: 14).RunAsync();

        created.Should().Be(expected);
    }

    [Fact]
    public async Task Losing_the_race_to_the_other_trigger_is_not_an_error()
    {
        ConfirmedCycle(_store.SignIn(), Jan1);
        _store.FailNextSave = new ConflictException("cycle.exists", "duplicate");

        var created = await At(2026, 2, 5).RunAsync();

        created.Should().Be(0);
    }

    [Fact]
    public async Task Only_the_current_users_cycles_roll_over()
    {
        var other = ConfirmedCycle(_store.SignIn(), Jan1);
        _store.SignIn();

        await At(2026, 2, 5).RunAsync();

        _store.Cycles.Should().ContainSingle().Which.Should().BeSameAs(other);
    }

    [Fact]
    public async Task An_unknown_user_is_not_found()
    {
        _store.Id = Guid.NewGuid();

        var run = () => At(2026, 2, 5).RunAsync();

        (await run.Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("user.not-found");
    }
}
