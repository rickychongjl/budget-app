namespace Budget.Domain.Tests;

public class CycleTimelineMoveStartTests
{
    // Chain(3) starts 1 Jan, 31 Jan, 2 Mar; on 15 Feb the second cycle is current.
    private static readonly DateOnly Today = new(2026, 2, 15);

    [Fact]
    public void Moving_the_current_cycle_re_dates_future_cycles_and_leaves_past_ones_alone()
    {
        var timeline = TestData.Chain(4);

        timeline.MoveStart(timeline.Cycles[1], new DateOnly(2026, 2, 5), Today);

        timeline.Cycles.Select(c => c.StartDate).Should().Equal(
            new DateOnly(2026, 1, 1),
            new DateOnly(2026, 2, 5),
            new DateOnly(2026, 3, 7),
            new DateOnly(2026, 4, 6));
        timeline.Cycles[1].EndDate.Should().Be(new DateOnly(2026, 3, 6));
    }

    [Fact]
    public void Past_cycle_cannot_move()
    {
        var timeline = TestData.Chain(3);

        var act = () => timeline.MoveStart(timeline.Cycles[0], new DateOnly(2026, 1, 2), Today);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("cycle.past.readonly");
    }

    [Fact]
    public void Future_cycle_cannot_move()
    {
        var timeline = TestData.Chain(3);

        var act = () => timeline.MoveStart(timeline.Cycles[2], new DateOnly(2026, 3, 10), Today);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("cycle.future.readonly");
    }

    [Theory]
    [InlineData(2026, 1, 30)] // the previous cycle's last day
    [InlineData(2026, 1, 20)]
    public void New_start_must_be_after_the_previous_cycle_ends(int year, int month, int day)
    {
        var timeline = TestData.Chain(3);

        var act = () => timeline.MoveStart(timeline.Cycles[1], new DateOnly(year, month, day), Today);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("cycle.start.overlap");
        timeline.Cycles[1].StartDate.Should().Be(new DateOnly(2026, 1, 31));
    }

    [Fact]
    public void A_gap_can_be_closed_up_to_the_day_after_the_previous_cycle_ends()
    {
        var first = TestData.Confirmed(new DateOnly(2026, 1, 1));
        var afterGap = TestData.Confirmed(new DateOnly(2026, 2, 10));
        var timeline = new CycleTimeline([first, afterGap]);

        timeline.MoveStart(afterGap, new DateOnly(2026, 1, 31), Today);

        afterGap.StartDate.Should().Be(new DateOnly(2026, 1, 31));
    }

    [Fact]
    public void A_gap_is_allowed()
    {
        var timeline = TestData.Chain(2);

        timeline.MoveStart(timeline.Cycles[1], new DateOnly(2026, 2, 14), Today);

        timeline.Cycles[1].StartDate.Should().Be(new DateOnly(2026, 2, 14));
        timeline.Cycles[0].EndDate.Should().Be(new DateOnly(2026, 1, 30));
    }

    [Fact]
    public void Start_can_move_into_the_future()
    {
        var timeline = TestData.Chain(2);

        timeline.MoveStart(timeline.Cycles[1], new DateOnly(2026, 2, 20), Today);

        timeline.Current(Today).Should().BeSameAs(timeline.Cycles[1]);
    }

    [Fact]
    public void Without_a_previous_cycle_the_start_can_move_back_until_the_cycle_would_end_today()
    {
        var only = TestData.Confirmed(new DateOnly(2026, 2, 1));
        var timeline = new CycleTimeline([only]);

        timeline.MoveStart(only, new DateOnly(2026, 1, 17), Today);

        only.EndDate.Should().Be(Today);
    }

    [Fact]
    public void Start_cannot_move_so_far_back_that_the_cycle_has_already_ended()
    {
        var only = TestData.Confirmed(new DateOnly(2026, 2, 1));
        var timeline = new CycleTimeline([only]);

        var act = () => timeline.MoveStart(only, new DateOnly(2026, 1, 16), Today);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("cycle.start.ends-before-today");
        only.StartDate.Should().Be(new DateOnly(2026, 2, 1));
    }

    [Fact]
    public void Draft_first_cycle_can_be_backdated_freely()
    {
        var draft = new Cycle(TestData.UserId, new DateOnly(2026, 2, 1));
        var timeline = new CycleTimeline([draft]);

        timeline.MoveStart(draft, new DateOnly(2025, 12, 1), Today);

        draft.StartDate.Should().Be(new DateOnly(2025, 12, 1));
    }

    [Fact]
    public void A_cycle_from_another_timeline_is_a_programming_error()
    {
        var timeline = TestData.Chain(2);
        var stranger = TestData.Confirmed(new DateOnly(2026, 1, 31));

        var act = () => timeline.MoveStart(stranger, new DateOnly(2026, 2, 5), Today);

        act.Should().Throw<ArgumentException>();
        timeline.Cycles[1].StartDate.Should().Be(new DateOnly(2026, 1, 31));
    }

    [Fact]
    public void Transactions_stay_in_the_cycle_even_when_their_date_now_falls_before_it()
    {
        var timeline = TestData.Chain(2);
        var current = timeline.Cycles[1];
        var transaction = new Transaction(current, Guid.NewGuid(), 10m, new DateOnly(2026, 2, 1), null, Guid.NewGuid(), TestData.Now);

        timeline.MoveStart(current, new DateOnly(2026, 2, 10), Today);

        transaction.CycleId.Should().Be(current.Id);
        current.Covers(transaction.OccurredOn).Should().BeFalse();
    }
}
