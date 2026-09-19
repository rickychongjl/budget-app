namespace Budget.Domain.Tests;

public class TransactionTests
{
    private static readonly Guid CategoryId = Guid.NewGuid();
    private static readonly Guid ClientId = Guid.NewGuid();
    private static readonly Cycle Cycle = TestData.Confirmed(new DateOnly(2026, 1, 1));

    private static Transaction Create(Cycle? cycle = null, decimal amount = 12.50m) =>
        new(cycle ?? Cycle, CategoryId, amount, new DateOnly(2026, 1, 5), "lunch", ClientId, TestData.Now);

    [Fact]
    public void Belongs_to_the_cycle_it_was_created_in()
    {
        var transaction = Create();

        transaction.CycleId.Should().Be(Cycle.Id);
        transaction.UserId.Should().Be(Cycle.UserId);
        transaction.CategoryId.Should().Be(CategoryId);
        transaction.Amount.Should().Be(12.50m);
        transaction.OccurredOn.Should().Be(new DateOnly(2026, 1, 5));
        transaction.Note.Should().Be("lunch");
        transaction.ClientId.Should().Be(ClientId);
        transaction.CreatedAt.Should().Be(TestData.Now);
        transaction.UpdatedAt.Should().Be(TestData.Now);
        transaction.Id.Should().NotBeEmpty();
    }

    [Fact]
    public void Needs_a_confirmed_cycle()
    {
        var act = () => Create(new Cycle(TestData.UserId, new DateOnly(2026, 1, 1)));

        act.Should().Throw<DomainException>().Which.Code.Should().Be("cycle.draft");
    }

    [Fact]
    public void Amount_is_validated()
    {
        var act = () => Create(amount: 0m);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("money.zero");
    }

    [Fact]
    public void Negative_amount_is_a_reversal()
    {
        Create(amount: -12.50m).Amount.Should().Be(-12.50m);
    }

    [Fact]
    public void Cycle_cannot_be_changed()
    {
        typeof(Transaction).GetProperty(nameof(Transaction.CycleId))!.CanWrite.Should().BeFalse();
    }

    [Fact]
    public void Editing_the_date_outside_the_cycle_does_not_move_the_transaction()
    {
        var transaction = Create();
        var otherCategory = Guid.NewGuid();
        var later = TestData.Now.AddHours(1);

        transaction.Edit(otherCategory, 20m, new DateOnly(2025, 12, 25), null, later);

        transaction.CycleId.Should().Be(Cycle.Id);
        transaction.CategoryId.Should().Be(otherCategory);
        transaction.Amount.Should().Be(20m);
        transaction.OccurredOn.Should().Be(new DateOnly(2025, 12, 25));
        transaction.Note.Should().BeNull();
        transaction.CreatedAt.Should().Be(TestData.Now);
        transaction.UpdatedAt.Should().Be(later);
    }

    [Fact]
    public void Edit_validates_the_amount()
    {
        var act = () => Create().Edit(CategoryId, 1.999m, new DateOnly(2026, 1, 5), null, TestData.Now);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("money.scale");
    }
}
