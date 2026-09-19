namespace Budget.Domain;

// Per-cycle snapshot of a category: editing it never touches another cycle.
public sealed class CycleCategory
{
    public CycleCategory(Cycle cycle, Guid categoryId, string name, string icon, string colour, int sortOrder, decimal budgetAmount)
    {
        UserId = cycle.UserId;
        CycleId = cycle.Id;
        CategoryId = categoryId;
        Name = name;
        Icon = icon;
        Colour = colour;
        SortOrder = sortOrder;
        BudgetAmount = Money.Budget(budgetAmount);
    }

    public Guid Id { get; } = Guid.NewGuid();
    public Guid UserId { get; }
    public Guid CycleId { get; }
    public Guid CategoryId { get; }
    public string Name { get; private set; }
    public string Icon { get; private set; }
    public string Colour { get; private set; }
    public int SortOrder { get; private set; }

    // Spend limit for a Debit category, expected amount for a Credit one.
    public decimal BudgetAmount { get; private set; }

    public void Edit(string name, string icon, string colour, int sortOrder, decimal budgetAmount)
    {
        BudgetAmount = Money.Budget(budgetAmount);
        Name = name;
        Icon = icon;
        Colour = colour;
        SortOrder = sortOrder;
    }

    public CycleCategory CopyTo(Cycle next) => new(next, CategoryId, Name, Icon, Colour, SortOrder, BudgetAmount);

    // Whether transactions exist is a repository question, so the caller passes the answer in.
    public void EnsureRemovable(bool hasTransactions)
    {
        if (hasTransactions)
        {
            throw new DomainException("category.has-transactions", "A category with transactions in this cycle cannot be removed from it.");
        }
    }
}
