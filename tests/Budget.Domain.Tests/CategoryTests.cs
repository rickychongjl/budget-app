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

        february.Edit("Groceries", "shopping-cart", "green", 2, 450m, spreadEvenly: false, autoPay: true);

        january.Name.Should().Be("Food");
        january.BudgetAmount.Should().Be(400m);
        february.Name.Should().Be("Groceries");
        february.Icon.Should().Be("shopping-cart");
        february.Colour.Should().Be("green");
        february.SortOrder.Should().Be(2);
        february.BudgetAmount.Should().Be(450m);
        february.SpreadEvenly.Should().BeFalse();
        february.AutoPay.Should().BeTrue();
        january.SpreadEvenly.Should().BeTrue();
        january.AutoPay.Should().BeFalse();
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
        var edit = () => Food().Edit("Food", "utensils", "blue", 1, -1m, spreadEvenly: true, autoPay: false);

        create.Should().Throw<DomainException>().Which.Code.Should().Be("money.negative");
        edit.Should().Throw<DomainException>().Which.Code.Should().Be("money.negative");
    }

    private static CycleCategory Rent(Cycle? cycle = null, decimal budget = 2200m) =>
        new(cycle ?? Cycle, Guid.NewGuid(), "Rent", "house", "slate", 0, budget, spreadEvenly: false, autoPay: true);

    [Fact]
    public void Auto_pay_is_off_unless_asked_for_and_is_copied_to_the_next_cycle()
    {
        Food().AutoPay.Should().BeFalse();
        Rent().CopyTo(Cycle.CreateNext()).AutoPay.Should().BeTrue();
    }

    [Fact]
    public void Auto_pay_is_only_for_a_bill_paid_in_one_go()
    {
        var create = () => new CycleCategory(Cycle, Guid.NewGuid(), "Food", "utensils", "blue", 1, 400m, spreadEvenly: true, autoPay: true);
        var edit = () => Rent().Edit("Rent", "house", "slate", 0, 2200m, spreadEvenly: true, autoPay: true);

        create.Should().Throw<DomainException>().Which.Code.Should().Be("category.auto-pay-spread");
        edit.Should().Throw<DomainException>().Which.Code.Should().Be("category.auto-pay-spread");
    }

    [Fact]
    public void Auto_payment_is_the_budget_on_the_first_day_of_the_cycle()
    {
        var next = Cycle.CreateNext();
        next.Confirm();
        var rent = Rent().CopyTo(next);

        var payment = rent.AutoPayment(next, TestData.Now)!;

        payment.CycleId.Should().Be(next.Id);
        payment.CategoryId.Should().Be(rent.CategoryId);
        payment.Amount.Should().Be(2200m);
        payment.OccurredOn.Should().Be(next.StartDate);
        payment.Note.Should().Be("Auto-paid");
        payment.CreatedAt.Should().Be(TestData.Now);
    }

    [Fact]
    public void Auto_payment_has_the_same_client_id_every_time_so_a_retry_cannot_pay_twice()
    {
        var rent = Rent();

        rent.AutoPayment(Cycle, TestData.Now)!.ClientId.Should().Be(rent.AutoPayment(Cycle, TestData.Now)!.ClientId);
        Rent().AutoPayment(Cycle, TestData.Now)!.ClientId.Should().NotBe(rent.AutoPayment(Cycle, TestData.Now)!.ClientId);
    }

    [Fact]
    public void No_auto_payment_without_auto_pay_or_with_a_zero_budget()
    {
        Food().AutoPayment(Cycle, TestData.Now).Should().BeNull();
        Rent(budget: 0m).AutoPayment(Cycle, TestData.Now).Should().BeNull();
    }

    [Fact]
    public void Auto_payment_is_only_made_into_the_snapshot_s_own_cycle()
    {
        var act = () => Rent().AutoPayment(Cycle.CreateNext(), TestData.Now);

        act.Should().Throw<ArgumentException>();
    }
}
