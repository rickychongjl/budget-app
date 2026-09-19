namespace Budget.Domain;

public sealed class Transaction
{
    public Transaction(Cycle cycle, Guid categoryId, decimal amount, DateOnly occurredOn, string? note, Guid clientId, DateTimeOffset now)
    {
        if (cycle.Status == CycleStatus.Draft)
        {
            throw new DomainException("cycle.draft", "Transactions need a confirmed cycle.");
        }

        UserId = cycle.UserId;
        CycleId = cycle.Id;
        CategoryId = categoryId;
        Amount = Money.Amount(amount);
        OccurredOn = occurredOn;
        Note = note;
        ClientId = clientId;
        CreatedAt = now;
        UpdatedAt = now;
    }

    public Guid Id { get; } = Guid.NewGuid();
    public Guid UserId { get; }

    // Set once. Never recomputed from OccurredOn, even when the cycle's dates move.
    public Guid CycleId { get; }
    public Guid CategoryId { get; private set; }
    public decimal Amount { get; private set; }
    public DateOnly OccurredOn { get; private set; }
    public string? Note { get; private set; }
    public Guid ClientId { get; }
    public DateTimeOffset CreatedAt { get; }
    public DateTimeOffset UpdatedAt { get; private set; }

    public void Edit(Guid categoryId, decimal amount, DateOnly occurredOn, string? note, DateTimeOffset now)
    {
        Amount = Money.Amount(amount);
        CategoryId = categoryId;
        OccurredOn = occurredOn;
        Note = note;
        UpdatedAt = now;
    }
}
