namespace Budget.Domain.Tests;

public class CategoryTests
{
    private static readonly Cycle Cycle = TestData.Confirmed(new DateOnly(2026, 1, 1));

    private static CycleCategory Food(Cycle? cycle = null, decimal budget = 400m) =>
        new(cycle ?? Cycle, Guid.NewGuid(), "Food", "utensils", "blue", 1, budget);

    [Fact]
    public void Category_type_is_immutable()
    {
        var category = new Category(TestData.UserId, CategoryType.Debit, TestData.Now);

        category.Type.Should().Be(CategoryType.Debit);
        category.UserId.Should().Be(TestData.UserId);
        category.CreatedAt.Should().Be(TestData.Now);
        category.Id.Should().NotBeEmpty();
        typeof(Category).GetProperty(nameof(Category.Type))!.CanWrite.Should().BeFalse();
    }

    [Fact]
    public void Snapshot_belongs_to_its_cycle()
    {
        var food = Food();

        food.CycleId.Should().Be(Cycle.Id);
        food.UserId.Should().Be(Cycle.UserId);
        food.Id.Should().NotBeEmpty();
    }

    [Fact]
    public void Editing_a_snapshot_changes_only_that_cycle()
    {
        var january = Food();
        var february = january.CopyTo(Cycle.CreateNext());

        february.Edit("Groceries", "shopping-cart", "green", 2, 450m, spreadEvenly: false);

        january.Name.Should().Be("Food");
        january.BudgetAmount.Should().Be(400m);
        february.Name.Should().Be("Groceries");
        february.Icon.Should().Be("shopping-cart");
        february.Colour.Should().Be("green");
        february.SortOrder.Should().Be(2);
        february.BudgetAmount.Should().Be(450m);
        february.SpreadEvenly.Should().BeFalse();
        january.SpreadEvenly.Should().BeTrue();
    }

    [Fact]
    public void A_new_snapshot_is_spent_evenly_over_the_cycle_unless_told_otherwise()
    {
        Food().SpreadEvenly.Should().BeTrue();
        new CycleCategory(Cycle, Guid.NewGuid(), "Rent", "house", "slate", 0, 2200m, spreadEvenly: false).SpreadEvenly.Should().BeFalse();
    }

    [Fact]
    public void A_bill_stays_a_bill_in_the_next_cycle()
    {
        var rent = new CycleCategory(Cycle, Guid.NewGuid(), "Rent", "house", "slate", 0, 2200m, spreadEvenly: false);

        rent.CopyTo(Cycle.CreateNext()).SpreadEvenly.Should().BeFalse();
    }

    [Fact]
    public void Copy_keeps_the_category_and_takes_the_new_cycle()
    {
        var january = Food();
        var next = Cycle.CreateNext();

        var february = january.CopyTo(next);

        february.Should().BeEquivalentTo(january, o => o.Excluding(c => c.Id).Excluding(c => c.CycleId));
        february.CycleId.Should().Be(next.Id);
        february.Id.Should().NotBe(january.Id);
    }

    [Fact]
    public void Cannot_be_removed_while_it_has_transactions_in_the_cycle()
    {
        var act = () => Food().EnsureRemovable(hasTransactions: true);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("category.has-transactions");
    }

    [Fact]
    public void Can_be_removed_when_it_has_no_transactions()
    {
        var act = () => Food().EnsureRemovable(hasTransactions: false);

        act.Should().NotThrow();
    }

    [Fact]
    public void Zero_budget_is_allowed()
    {
        Food(budget: 0m).BudgetAmount.Should().Be(0m);
    }

    [Fact]
    public void Negative_budget_is_rejected_on_create_and_edit()
    {
        var create = () => Food(budget: -1m);
        var edit = () => Food().Edit("Food", "utensils", "blue", 1, -1m, spreadEvenly: true);

        create.Should().Throw<DomainException>().Which.Code.Should().Be("money.negative");
        edit.Should().Throw<DomainException>().Which.Code.Should().Be("money.negative");
    }
}
