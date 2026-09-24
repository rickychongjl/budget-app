namespace Budget.Domain;

// Per-cycle snapshot of a category: editing it never touches another cycle.
public sealed class CycleCategory
{
    public CycleCategory(Cycle cycle, Guid categoryId, string name, string icon, string colour, int sortOrder, decimal budgetAmount, bool spreadEvenly = true)
        : this(cycle.UserId, cycle.Id, categoryId, name, icon, colour, sortOrder, budgetAmount, spreadEvenly)
    {
    }

    // Persistence rebuilds a row without its Cycle in hand.
    private CycleCategory(Guid userId, Guid cycleId, Guid categoryId, string name, string icon, string colour, int sortOrder, decimal budgetAmount, bool spreadEvenly)
    {
        UserId = userId;
        CycleId = cycleId;
        CategoryId = categoryId;
        Name = name;
        Icon = icon;
        Colour = colour;
        SortOrder = sortOrder;
        BudgetAmount = Money.Budget(budgetAmount);
        SpreadEvenly = spreadEvenly;
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

    // Spent a little at a time (food), so the UI can say when spending runs ahead of the calendar. False for a bill
    // paid in one go (rent), which would otherwise look ahead of pace from the day it is paid. Presentation only: no
    // rule here or in the rollup depends on it.
    public bool SpreadEvenly { get; private set; }

    public void Edit(string name, string icon, string colour, int sortOrder, decimal budgetAmount, bool spreadEvenly)
    {
        BudgetAmount = Money.Budget(budgetAmount);
        Name = name;
        Icon = icon;
        Colour = colour;
        SortOrder = sortOrder;
        SpreadEvenly = spreadEvenly;
    }

    public CycleCategory CopyTo(Cycle next) => new(next, CategoryId, Name, Icon, Colour, SortOrder, BudgetAmount, SpreadEvenly);

    // Whether transactions exist is a repository question, so the caller passes the answer in.
    public void EnsureRemovable(bool hasTransactions)
    {
        if (hasTransactions)
        {
            throw new DomainException("category.has-transactions", "A category with transactions in this cycle cannot be removed from it.");
        }
    }
}
