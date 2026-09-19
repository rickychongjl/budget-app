namespace Budget.Domain.Tests;

public class CycleTimelineRolloverTests
{
    private static readonly DateOnly Jan1 = new(2026, 1, 1);

    private static CycleCategory Snapshot(Cycle cycle, string name, decimal budget) =>
        new(cycle, Guid.NewGuid(), name, "circle", "blue", 1, budget);

    [Fact]
    public void Nothing_is_created_while_the_latest_cycle_covers_today()
    {
        var timeline = TestData.Chain(1);

        var result = timeline.RollForward(new DateOnly(2026, 1, 30), []);

        result.Cycles.Should().BeEmpty();
        result.Categories.Should().BeEmpty();
        timeline.Cycles.Should().HaveCount(1);
    }

    [Fact]
    public void One_overdue_cycle_creates_the_next_one()
    {
        var timeline = TestData.Chain(1);

        var result = timeline.RollForward(new DateOnly(2026, 1, 31), []);

        result.Cycles.Should().ContainSingle().Which.StartDate.Should().Be(new DateOnly(2026, 1, 31));
        timeline.Cycles.Should().HaveCount(2);
        timeline.Current(new DateOnly(2026, 1, 31)).Should().BeSameAs(result.Cycles[0]);
    }

    [Fact]
    public void Long_overdue_creates_cycles_until_one_covers_today()
    {
        var timeline = TestData.Chain(1);
        var today = new DateOnly(2026, 1, 30).AddDays(95);

        var result = timeline.RollForward(today, []);

        result.Cycles.Select(c => c.StartDate).Should().Equal(
            new DateOnly(2026, 1, 31),
            new DateOnly(2026, 3, 2),
            new DateOnly(2026, 4, 1),
            new DateOnly(2026, 5, 1));
        result.Cycles.Should().OnlyContain(c => c.Status == CycleStatus.Confirmed);
        result.Cycles[^1].Covers(today).Should().BeTrue();
    }

    [Fact]
    public void Running_it_again_does_nothing()
    {
        var timeline = TestData.Chain(1);
        var today = new DateOnly(2026, 3, 15);
        timeline.RollForward(today, []);

        var again = timeline.RollForward(today, []);

        again.Cycles.Should().BeEmpty();
        timeline.Cycles.Should().HaveCount(3);
    }

    [Fact]
    public void User_whose_only_cycle_is_a_draft_is_skipped()
    {
        var timeline = new CycleTimeline([new Cycle(TestData.UserId, Jan1)]);

        var result = timeline.RollForward(new DateOnly(2026, 6, 1), []);

        result.Cycles.Should().BeEmpty();
        timeline.Cycles.Should().HaveCount(1);
    }

    [Fact]
    public void User_with_no_cycles_is_skipped()
    {
        new CycleTimeline([]).RollForward(new DateOnly(2026, 6, 1), []).Cycles.Should().BeEmpty();
    }

    [Fact]
    public void Existing_future_cycles_count()
    {
        var timeline = TestData.Chain(3);

        var result = timeline.RollForward(new DateOnly(2026, 2, 15), []);

        result.Cycles.Should().BeEmpty();
    }

    [Fact]
    public void Categories_are_copied_from_the_latest_cycle_into_every_new_cycle()
    {
        var timeline = TestData.Chain(2);
        var older = Snapshot(timeline.Cycles[0], "Old name", 100m);
        var food = Snapshot(timeline.Cycles[1], "Food", 400m);
        var addedMidCycle = Snapshot(timeline.Cycles[1], "Gifts", 50m);

        var result = timeline.RollForward(new DateOnly(2026, 4, 15), [older, food, addedMidCycle]);

        result.Cycles.Should().HaveCount(2);
        foreach (var cycle in result.Cycles)
        {
            var copies = result.Categories.Where(c => c.CycleId == cycle.Id).ToList();
            copies.Select(c => c.CategoryId).Should().BeEquivalentTo([food.CategoryId, addedMidCycle.CategoryId]);
            copies.Select(c => c.Name).Should().BeEquivalentTo(["Food", "Gifts"]);
            copies.Select(c => c.BudgetAmount).Should().BeEquivalentTo([400m, 50m]);
        }

        result.Categories.Should().HaveCount(4);
    }

    [Fact]
    public void Opening_balance_follows_the_previous_closing_balance()
    {
        var timeline = TestData.Chain(1);
        timeline.SetClosingBalance(timeline.Cycles[0], 1234.56m, new DateOnly(2026, 1, 30));

        var result = timeline.RollForward(new DateOnly(2026, 3, 15), []);

        result.Cycles[0].OpeningBalance.Should().Be(1234.56m);
        result.Cycles[1].OpeningBalance.Should().BeNull("the cycle before it has no closing balance yet");
    }

    [Fact]
    public void Opening_balance_is_empty_until_the_previous_closing_balance_is_entered()
    {
        var timeline = TestData.Chain(1);

        var result = timeline.RollForward(new DateOnly(2026, 1, 31), []);

        result.Cycles[0].OpeningBalance.Should().BeNull();
    }

    [Fact]
    public void Entering_a_closing_balance_later_updates_the_next_opening_balance()
    {
        var timeline = TestData.Chain(2);
        var today = new DateOnly(2026, 2, 15);
        timeline.SetOpeningBalance(timeline.Cycles[1], 999m, today);

        timeline.SetClosingBalance(timeline.Cycles[0], 1500m, today);

        timeline.Cycles[1].OpeningBalance.Should().Be(1500m);
    }

    [Fact]
    public void Closing_balance_of_the_latest_cycle_has_nowhere_to_go_yet()
    {
        var timeline = TestData.Chain(1);

        timeline.SetClosingBalance(timeline.Cycles[0], 1500m, new DateOnly(2026, 1, 15));

        timeline.Cycles[0].ClosingBalance.Should().Be(1500m);
    }
}
