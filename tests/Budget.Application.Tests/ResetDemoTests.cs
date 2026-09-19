using Budget.Domain;

namespace Budget.Application.Tests;

// Runs against the real fixture (tests/e2e/fixtures/demo-seed.json, linked into the output), so a bad edit to it fails here.
public sealed class ResetDemoTests
{
    // Noon on 10 January in Sydney.
    private static readonly DateTimeOffset Now = new(2026, 1, 10, 1, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 1, 10);
    private static readonly string[] PaletteSlots = ["blue", "orange", "violet", "cyan", "pink", "teal", "ochre", "slate"];

    private readonly DemoFixture _fixture = DemoFixture.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "demo-seed.json")));
    private readonly FakeStore _store = new();

    private ResetDemo Sut() => new(_store, _store, _store, _store, _store, new FixedClock(Now));

    private User Demo() => _store.SignIn(isDemo: true);

    [Fact]
    public void The_fixture_stays_inside_the_demo_caps_and_the_design_system()
    {
        _fixture.Categories.Should().HaveCountLessThanOrEqualTo(DemoCaps.MaxCategories);
        _fixture.Categories.Select(c => c.Key).Should().OnlyHaveUniqueItems();
        _fixture.Categories.Should().OnlyContain(c => PaletteSlots.Contains(c.Colour) && c.Name.Length <= 60 && c.Icon.Length <= 40 && c.Budget > 0);

        _fixture.Transactions.Should().HaveCountLessThanOrEqualTo(DemoCaps.MaxTransactions / 2, "visitors need room to add their own");
        _fixture.Transactions.Should().OnlyContain(t => (t.Note ?? "").Length <= DemoCaps.MaxNoteLength && t.Amount != 0);
        _fixture.Transactions.Should().OnlyContain(t => t.DayOffset <= 0 && t.DayOffset >= _fixture.FirstCycleStartOffset);
        _fixture.Transactions.Select(t => t.Category).Should().BeSubsetOf(_fixture.Categories.Select(c => c.Key));
    }

    [Fact]
    public async Task Reset_builds_history_and_a_current_cycle_around_today()
    {
        var demo = Demo();

        await Sut().RunAsync(_fixture);

        var cycles = _store.Cycles.OrderBy(c => c.StartDate).ToList();
        cycles.Should().HaveCount(3).And.OnlyContain(c => c.UserId == demo.Id && c.Status == CycleStatus.Confirmed);
        cycles[0].StartDate.Should().Be(Today.AddDays(_fixture.FirstCycleStartOffset));
        cycles[^1].Covers(Today).Should().BeTrue();

        cycles.Select(c => c.OpeningBalance).Should().Equal(_fixture.OpeningBalance, _fixture.ClosingBalances[0], _fixture.ClosingBalances[1]);
        cycles.Select(c => c.ClosingBalance).Should().Equal(_fixture.ClosingBalances[0], _fixture.ClosingBalances[1], null);

        _store.Categories.Should().HaveCount(_fixture.Categories.Count);
        _store.CycleCategories.Should().HaveCount(_fixture.Categories.Count * 3);
        _store.CycleCategories.Where(c => c.CycleId == cycles[0].Id).Select(c => c.SortOrder).Should().BeInAscendingOrder().And.OnlyHaveUniqueItems();

        _store.Transactions.Should().HaveCount(_fixture.Transactions.Count);
        _store.Transactions.Should().OnlyContain(t => cycles.Single(c => c.Id == t.CycleId).Covers(t.OccurredOn));
        _store.Transactions.Select(t => t.ClientId).Should().OnlyHaveUniqueItems();
        var currentId = cycles[^1].Id;
        _store.Transactions.Should().Contain(t => t.CycleId == currentId, "the current cycle is not empty");
    }

    [Fact]
    public async Task Reset_again_clears_what_visitors_left_and_touches_nobody_else()
    {
        var someoneElse = _store.SignIn();
        var theirCycle = new Cycle(someoneElse.Id, Today);
        _store.Cycles.Add(theirCycle);
        var demo = Demo();
        await Sut().RunAsync(_fixture);
        var current = _store.Cycles.Where(c => c.UserId == demo.Id).MaxBy(c => c.StartDate)!;
        var category = _store.CycleCategories.First(c => c.CycleId == current.Id);
        _store.Transactions.Add(new Transaction(current, category.CategoryId, 1m, Today, "a visitor was here", Guid.NewGuid(), Now));

        await Sut().RunAsync(_fixture);

        _store.Transactions.Should().HaveCount(_fixture.Transactions.Count).And.NotContain(t => t.Note == "a visitor was here");
        _store.Cycles.Where(c => c.UserId == demo.Id).Should().HaveCount(3);
        _store.Cycles.Should().Contain(theirCycle);
    }

    [Fact]
    public async Task Seeding_only_happens_when_the_demo_is_empty()
    {
        Demo();

        await Sut().SeedIfEmptyAsync(_fixture);
        var saves = _store.Saves;
        await Sut().SeedIfEmptyAsync(_fixture);

        _store.Cycles.Should().HaveCount(3);
        _store.Saves.Should().Be(saves);
    }

    [Fact]
    public async Task Without_a_demo_user_there_is_nothing_to_reset()
    {
        _store.SignIn();

        (await Sut().Invoking(s => s.RunAsync(_fixture)).Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("demo.unavailable");
        _store.Cycles.Should().BeEmpty();
    }
}
