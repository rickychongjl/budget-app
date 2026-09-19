namespace Budget.Domain.Tests;

public class CycleTimelinePhaseTests
{
    [Fact]
    public void Current_is_the_earliest_cycle_that_has_not_ended()
    {
        var timeline = TestData.Chain(3);

        timeline.Current(new DateOnly(2026, 1, 30)).Should().BeSameAs(timeline.Cycles[0]);
        timeline.Current(new DateOnly(2026, 1, 31)).Should().BeSameAs(timeline.Cycles[1]);
    }

    [Fact]
    public void Cycles_are_ordered_by_start_date_whatever_order_they_arrive_in()
    {
        var chain = TestData.Chain(3).Cycles;

        var timeline = new CycleTimeline([chain[2], chain[0], chain[1]]);

        timeline.Cycles.Should().Equal(chain);
    }

    [Fact]
    public void In_a_gap_the_next_cycle_is_current_even_though_it_has_not_started()
    {
        var first = TestData.Confirmed(new DateOnly(2026, 1, 1));
        var afterGap = TestData.Confirmed(new DateOnly(2026, 2, 10));
        var timeline = new CycleTimeline([first, afterGap]);

        timeline.Current(new DateOnly(2026, 2, 5)).Should().BeSameAs(afterGap);
    }

    [Fact]
    public void There_is_no_current_cycle_when_every_cycle_has_ended()
    {
        TestData.Chain(2).Current(new DateOnly(2026, 6, 1)).Should().BeNull();
    }

    [Fact]
    public void Phases_are_relative_to_the_current_cycle()
    {
        var timeline = TestData.Chain(3);
        var today = new DateOnly(2026, 2, 15);

        timeline.PhaseOf(timeline.Cycles[0], today).Should().Be(CyclePhase.Past);
        timeline.PhaseOf(timeline.Cycles[1], today).Should().Be(CyclePhase.Current);
        timeline.PhaseOf(timeline.Cycles[2], today).Should().Be(CyclePhase.Future);
    }

    [Fact]
    public void Every_cycle_is_past_when_none_is_current()
    {
        var timeline = TestData.Chain(2);

        timeline.PhaseOf(timeline.Cycles[1], new DateOnly(2026, 6, 1)).Should().Be(CyclePhase.Past);
    }
}
