namespace Budget.Domain.Tests;

public class CycleTimelineEditabilityTests
{
    // Chain(3): index 0 is past, 1 is current, 2 is future.
    private static readonly DateOnly Today = new(2026, 2, 15);
    private const int Past = 0, Current = 1, Future = 2;

    [Theory]
    [InlineData(Past, CycleEdit.Categories, false)]
    [InlineData(Past, CycleEdit.StartDate, false)]
    [InlineData(Past, CycleEdit.OpeningBalance, false)]
    [InlineData(Past, CycleEdit.ClosingBalance, true)]
    [InlineData(Past, CycleEdit.Transactions, true)]
    [InlineData(Current, CycleEdit.Categories, true)]
    [InlineData(Current, CycleEdit.StartDate, true)]
    [InlineData(Current, CycleEdit.OpeningBalance, true)]
    [InlineData(Current, CycleEdit.ClosingBalance, true)]
    [InlineData(Current, CycleEdit.Transactions, true)]
    [InlineData(Future, CycleEdit.Categories, true)]
    [InlineData(Future, CycleEdit.StartDate, false)]
    [InlineData(Future, CycleEdit.OpeningBalance, false)]
    [InlineData(Future, CycleEdit.ClosingBalance, false)]
    [InlineData(Future, CycleEdit.Transactions, false)]
    public void Editability_matrix(int index, CycleEdit edit, bool allowed)
    {
        var timeline = TestData.Chain(3);
        var act = () => timeline.EnsureCanEdit(timeline.Cycles[index], edit, Today);

        if (allowed)
        {
            act.Should().NotThrow();
        }
        else
        {
            var expected = index == Past ? "cycle.past.readonly" : "cycle.future.readonly";
            act.Should().Throw<DomainException>().Which.Code.Should().Be(expected);
        }
    }

    [Theory]
    [InlineData(CycleEdit.Categories)]
    [InlineData(CycleEdit.StartDate)]
    [InlineData(CycleEdit.OpeningBalance)]
    public void Draft_cycle_is_editable_whatever_its_dates(CycleEdit edit)
    {
        var draft = new Cycle(TestData.UserId, new DateOnly(2025, 1, 1));
        var timeline = new CycleTimeline([draft]);

        var act = () => timeline.EnsureCanEdit(draft, edit, Today);

        act.Should().NotThrow();
    }

    [Fact]
    public void Draft_cycle_takes_no_transactions()
    {
        var draft = new Cycle(TestData.UserId, new DateOnly(2026, 2, 1));
        var timeline = new CycleTimeline([draft]);

        var act = () => timeline.EnsureCanEdit(draft, CycleEdit.Transactions, Today);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("cycle.draft");
    }

    [Fact]
    public void Only_a_past_cycle_transaction_write_asks_for_a_closing_balance_review()
    {
        var timeline = TestData.Chain(3);

        timeline.RequiresClosingBalanceReview(timeline.Cycles[Past], Today).Should().BeTrue();
        timeline.RequiresClosingBalanceReview(timeline.Cycles[Current], Today).Should().BeFalse();
    }

    [Fact]
    public void Opening_balance_can_be_set_on_the_current_cycle()
    {
        var timeline = TestData.Chain(3);

        timeline.SetOpeningBalance(timeline.Cycles[Current], 1500.25m, Today);

        timeline.Cycles[Current].OpeningBalance.Should().Be(1500.25m);
    }

    [Fact]
    public void Opening_balance_of_a_past_cycle_is_read_only()
    {
        var timeline = TestData.Chain(3);

        var act = () => timeline.SetOpeningBalance(timeline.Cycles[Past], 1m, Today);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("cycle.past.readonly");
        timeline.Cycles[Past].OpeningBalance.Should().BeNull();
    }

    [Fact]
    public void Closing_balance_can_be_set_on_a_past_cycle()
    {
        var timeline = TestData.Chain(3);

        timeline.SetClosingBalance(timeline.Cycles[Past], -20m, Today);

        timeline.Cycles[Past].ClosingBalance.Should().Be(-20m);
    }

    [Fact]
    public void Closing_balance_of_a_future_cycle_is_rejected()
    {
        var timeline = TestData.Chain(3);

        var act = () => timeline.SetClosingBalance(timeline.Cycles[Future], 1m, Today);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("cycle.future.readonly");
    }

    [Fact]
    public void Balances_are_validated_as_money()
    {
        var timeline = TestData.Chain(3);

        var act = () => timeline.SetOpeningBalance(timeline.Cycles[Current], 1.005m, Today);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("money.scale");
    }
}
