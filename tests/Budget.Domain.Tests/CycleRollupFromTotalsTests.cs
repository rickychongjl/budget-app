namespace Budget.Domain.Tests;

// The report reads totals from SQL instead of transactions, so the two overloads must agree line for line.
public class CycleRollupFromTotalsTests
{
    private readonly Cycle _cycle = TestData.Confirmed(new DateOnly(2026, 1, 1));
    private readonly List<Category> _categories = [];
    private readonly List<CycleCategory> _cycleCategories = [];
    private readonly List<Transaction> _transactions = [];

    private Guid Add(string name, CategoryType type, decimal budget, int sortOrder = 0)
    {
        var category = new Category(TestData.UserId, type, TestData.Now);
        _categories.Add(category);
        _cycleCategories.Add(new CycleCategory(_cycle, category.Id, name, "circle", "blue", sortOrder, budget));
        return category.Id;
    }

    private void Spend(Guid categoryId, decimal amount) =>
        _transactions.Add(new Transaction(_cycle, categoryId, amount, new DateOnly(2026, 1, 5), null, Guid.NewGuid(), TestData.Now));

    private CycleRollup FromTransactions() => CycleRollup.Calculate(_cycle, _cycleCategories, _categories, _transactions);

    private CycleRollup FromTotals(IReadOnlyDictionary<Guid, decimal>? totals = null) =>
        CycleRollup.Calculate(
            _cycle,
            _cycleCategories,
            _categories,
            totals ?? _transactions.GroupBy(t => t.CategoryId).ToDictionary(g => g.Key, g => g.Sum(t => t.Amount)));

    [Fact]
    public void Totals_give_the_same_rollup_as_transactions()
    {
        var food = Add("Food", CategoryType.Debit, 400m, sortOrder: 1);
        var rent = Add("Rent", CategoryType.Debit, 1200m, sortOrder: 2);
        var misc = Add("Misc", CategoryType.Debit, 0m, sortOrder: 3);
        var salary = Add("Salary", CategoryType.Credit, 3000m, sortOrder: 4);
        Add("Untouched", CategoryType.Debit, 50m, sortOrder: 5);
        Spend(food, 450m);
        Spend(rent, 1200m);
        Spend(rent, -200m);
        Spend(misc, 10m);
        Spend(salary, 3100m);

        FromTotals().Should().BeEquivalentTo(FromTransactions());
    }

    [Fact]
    public void An_empty_cycle_gives_the_same_rollup_either_way()
    {
        Add("Food", CategoryType.Debit, 400m);

        FromTotals().Should().BeEquivalentTo(FromTransactions());
    }

    [Fact]
    public void Accrued_comes_from_the_balances_either_way()
    {
        var timeline = new CycleTimeline([_cycle]);
        timeline.SetOpeningBalance(_cycle, 1000m, new DateOnly(2026, 1, 15));
        timeline.SetClosingBalance(_cycle, 1750.50m, new DateOnly(2026, 1, 15));

        FromTotals().Accrued.Should().Be(750.50m);
    }

    [Fact]
    public void Total_for_a_category_the_cycle_does_not_have_is_an_invariant_breach()
    {
        Add("Food", CategoryType.Debit, 400m);

        var act = () => FromTotals(new Dictionary<Guid, decimal> { [Guid.NewGuid()] = 10m });

        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Snapshot_without_its_category_is_an_invariant_breach()
    {
        Add("Food", CategoryType.Debit, 400m);
        _categories.Clear();

        var act = () => FromTotals();

        act.Should().Throw<InvalidOperationException>();
    }
}
