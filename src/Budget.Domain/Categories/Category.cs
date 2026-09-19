namespace Budget.Domain;

// The stable identity across cycles. How it looks in a cycle is on CycleCategory.
public sealed class Category(Guid userId, CategoryType type, DateTimeOffset createdAt)
{
    public Guid Id { get; } = Guid.NewGuid();
    public Guid UserId { get; } = userId;
    public CategoryType Type { get; } = type;
    public DateTimeOffset CreatedAt { get; } = createdAt;
}
