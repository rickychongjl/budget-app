namespace Budget.Domain.Tests;

public class CycleTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private static readonly DateOnly Start = new(2026, 1, 1);

    [Fact]
    public void End_date_is_29_days_after_start()
    {
        new Cycle(UserId, Start).EndDate.Should().Be(new DateOnly(2026, 1, 30));
    }

    [Fact]
    public void End_date_cannot_be_set()
    {
        typeof(Cycle).GetProperty(nameof(Cycle.EndDate))!.CanWrite.Should().BeFalse();
    }

    [Fact]
    public void New_cycle_is_draft_with_no_balances()
    {
        var cycle = new Cycle(UserId, Start);

        cycle.Status.Should().Be(CycleStatus.Draft);
        cycle.UserId.Should().Be(UserId);
        cycle.Id.Should().NotBeEmpty();
        cycle.OpeningBalance.Should().BeNull();
        cycle.ClosingBalance.Should().BeNull();
    }

    [Fact]
    public void Confirm_is_idempotent()
    {
        var cycle = new Cycle(UserId, Start);

        cycle.Confirm();
        cycle.Confirm();

        cycle.Status.Should().Be(CycleStatus.Confirmed);
    }

    [Fact]
    public void Next_cycle_starts_30_days_later_and_is_confirmed()
    {
        var cycle = new Cycle(UserId, Start);
        cycle.Confirm();

        var next = cycle.CreateNext();

        next.StartDate.Should().Be(new DateOnly(2026, 1, 31));
        next.Status.Should().Be(CycleStatus.Confirmed);
        next.UserId.Should().Be(UserId);
        next.Id.Should().NotBe(cycle.Id);
    }

    [Fact]
    public void Draft_cycle_has_no_next()
    {
        var act = () => new Cycle(UserId, Start).CreateNext();

        act.Should().Throw<DomainException>().Which.Code.Should().Be("cycle.draft");
    }

    [Theory]
    [InlineData(2025, 12, 31, false)]
    [InlineData(2026, 1, 1, true)]
    [InlineData(2026, 1, 30, true)]
    [InlineData(2026, 1, 31, false)]
    public void Covers_is_inclusive_at_both_ends(int year, int month, int day, bool expected)
    {
        new Cycle(UserId, Start).Covers(new DateOnly(year, month, day)).Should().Be(expected);
    }
}
