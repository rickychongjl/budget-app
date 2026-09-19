namespace Budget.Domain.Tests;

public class MoneyTests
{
    public static readonly TheoryData<decimal> ValidAmounts = [0.01m, 12.5m, 12.50m, -40m, Money.Max, -Money.Max];

    [Theory]
    [MemberData(nameof(ValidAmounts))]
    public void Amount_accepts_two_decimal_places_and_reversals(decimal value)
    {
        Money.Amount(value).Should().Be(value);
    }

    [Fact]
    public void Amount_rejects_zero()
    {
        var act = () => Money.Amount(0m);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("money.zero");
    }

    [Fact]
    public void More_than_two_decimal_places_is_rejected()
    {
        var act = () => Money.Amount(1.005m);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("money.scale");
    }

    [Fact]
    public void Values_that_do_not_fit_decimal_18_2_are_rejected()
    {
        var act = () => Money.Amount(Money.Max + 0.01m);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("money.range");
    }

    [Fact]
    public void Budget_allows_zero_but_not_negatives()
    {
        Money.Budget(0m).Should().Be(0m);

        var act = () => Money.Budget(-1m);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("money.negative");
    }

    [Fact]
    public void Balance_allows_zero_and_overdrafts()
    {
        Money.Balance(0m).Should().Be(0m);
        Money.Balance(-250.75m).Should().Be(-250.75m);
    }
}
