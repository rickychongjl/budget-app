namespace Budget.Domain.Tests;

public class CycleRollupTests
{
    private readonly Cycle _cycle = TestData.Confirmed(new DateOnly(2026, 1, 1));
    private readonly List<Category> _categories = [];
    private readonly List<CycleCategory> _cycleCategories = [];
    private readonly List<Transaction> _transactions = [];

    private Guid Add(string name, CategoryType type, decimal budget, int sortOrder = 0, Cycle? cycle = null)
    {
        var category = new Category(TestData.UserId, type, TestData.Now);
        _categories.Add(category);
        _cycleCategories.Add(new CycleCategory(cycle ?? _cycle, category.Id, name, "circle", "blue", sortOrder, budget));
        return category.Id;
    }

    private void Spend(Guid categoryId, decimal amount, Cycle? cycle = null) =>
        _transactions.Add(new Transaction(cycle ?? _cycle, categoryId, amount, new DateOnly(2026, 1, 5), null, Guid.NewGuid(), TestData.Now));

    private CycleRollup Calculate() => CycleRollup.Calculate(_cycle, _cycleCategories, _categories, _transactions);

    [Fact]
    public void Category_line_sums_transactions_against_the_budget()
    {
        var food = Add("Food", CategoryType.Debit, 400m);
        Spend(food, 60m);
        Spend(food, 40m);

        var line = Calculate().Categories.Should().ContainSingle().Subject;

        line.CategoryId.Should().Be(food);
        line.Name.Should().Be("Food");
        line.Icon.Should().Be("circle");
        line.Colour.Should().Be("blue");
        line.Type.Should().Be(CategoryType.Debit);
        line.Budgeted.Should().Be(400m);
        line.Actual.Should().Be(100m);
        line.Remaining.Should().Be(300m);
        line.PercentUsed.Should().Be(25m);
        line.Status.Should().Be(RollupStatus.OnTrack);
    }

    [Fact]
    public void Reversal_subtracts()
    {
        var food = Add("Food", CategoryType.Debit, 400m);
        Spend(food, 100m);
        Spend(food, -30m);

        Calculate().Categories[0].Actual.Should().Be(70m);
    }

    [Theory]
    [InlineData(CategoryType.Debit, 399.99, RollupStatus.OnTrack)]
    [InlineData(CategoryType.Debit, 400, RollupStatus.OnTrack)]
    [InlineData(CategoryType.Debit, 400.01, RollupStatus.Over)]
    [InlineData(CategoryType.Credit, 400, RollupStatus.OnTrack)]
    [InlineData(CategoryType.Credit, 400.01, RollupStatus.Ahead)]
    public void Status_flips_only_when_actual_exceeds_budget(CategoryType type, double actual, RollupStatus expected)
    {
        var category = Add("Category", type, 400m);
        Spend(category, (decimal)actual);

        Calculate().Categories[0].Status.Should().Be(expected);
    }

    [Fact]
    public void Over_budget_has_negative_remaining()
    {
        var food = Add("Food", CategoryType.Debit, 400m);
        Spend(food, 450m);

        var line = Calculate().Categories[0];

        line.Remaining.Should().Be(-50m);
        line.PercentUsed.Should().Be(112.5m);
    }

    [Fact]
    public void Percent_used_is_empty_for_a_zero_budget()
    {
        var misc = Add("Misc", CategoryType.Debit, 0m);
        Spend(misc, 10m);

        var line = Calculate().Categories[0];

        line.PercentUsed.Should().BeNull();
        line.Status.Should().Be(RollupStatus.Over);
    }

    [Fact]
    public void Category_without_transactions_still_appears()
    {
        Add("Food", CategoryType.Debit, 400m);

        var line = Calculate().Categories.Should().ContainSingle().Subject;

        line.Actual.Should().Be(0m);
        line.PercentUsed.Should().Be(0m);
    }

    [Fact]
    public void Lines_follow_sort_order()
    {
        Add("Third", CategoryType.Debit, 1m, sortOrder: 3);
        Add("First", CategoryType.Credit, 1m, sortOrder: 1);
        Add("Second", CategoryType.Debit, 1m, sortOrder: 2);

        Calculate().Categories.Select(c => c.Name).Should().Equal("First", "Second", "Third");
    }

    [Fact]
    public void Totals_split_debits_and_credits()
    {
        var food = Add("Food", CategoryType.Debit, 400m);
        var rent = Add("Rent", CategoryType.Debit, 1200m);
        var salary = Add("Salary", CategoryType.Credit, 3000m);
        Spend(food, 100m);
        Spend(rent, 1200m);
        Spend(salary, 3100m);

        var rollup = Calculate();

        rollup.DebitsBudgeted.Should().Be(1600m);
        rollup.DebitsActual.Should().Be(1300m);
        rollup.CreditsBudgeted.Should().Be(3000m);
        rollup.CreditsActual.Should().Be(3100m);
        rollup.Net.Should().Be(1800m);
    }

    [Fact]
    public void Accrued_needs_both_balances()
    {
        var timeline = new CycleTimeline([_cycle]);
        var today = new DateOnly(2026, 1, 15);

        Calculate().Accrued.Should().BeNull();

        timeline.SetOpeningBalance(_cycle, 1000m, today);
        Calculate().Accrued.Should().BeNull();

        timeline.SetClosingBalance(_cycle, 1750.50m, today);
        Calculate().Accrued.Should().Be(750.50m);
    }

    [Fact]
    public void Rows_from_other_cycles_are_ignored()
    {
        var next = _cycle.CreateNext();
        var food = Add("Food", CategoryType.Debit, 400m);
        _cycleCategories.Add(_cycleCategories[0].CopyTo(next));
        Spend(food, 100m);
        Spend(food, 999m, next);

        var rollup = Calculate();

        rollup.Categories.Should().ContainSingle().Which.Actual.Should().Be(100m);
    }

    [Fact]
    public void Transaction_in_a_category_the_cycle_does_not_have_is_an_invariant_breach()
    {
        Add("Food", CategoryType.Debit, 400m);
        Spend(Guid.NewGuid(), 10m);

        var act = Calculate;

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Snapshot_without_its_category_is_an_invariant_breach()
    {
        Add("Food", CategoryType.Debit, 400m);
        _categories.Clear();

        var act = Calculate;

        act.Should().Throw<InvalidOperationException>();
    }
}
