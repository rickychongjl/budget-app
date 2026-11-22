using System.Security.Cryptography;

namespace Budget.Domain;

// Per-cycle snapshot of a category: editing it never touches another cycle.
public sealed class CycleCategory
{
    public const string AutoPaymentNote = "Auto-paid";

    public CycleCategory(Cycle cycle, Guid categoryId, string name, string icon, string colour, int sortOrder, decimal budgetAmount, bool spreadEvenly = true, bool autoPay = false)
        : this(cycle.UserId, cycle.Id, categoryId, name, icon, colour, sortOrder, budgetAmount, spreadEvenly, autoPay)
    {
    }

    // Persistence rebuilds a row without its Cycle in hand.
    private CycleCategory(Guid userId, Guid cycleId, Guid categoryId, string name, string icon, string colour, int sortOrder, decimal budgetAmount, bool spreadEvenly, bool autoPay)
    {
        EnsureAutoPayIsABill(spreadEvenly, autoPay);
        UserId = userId;
        CycleId = cycleId;
        CategoryId = categoryId;
        Name = name;
        Icon = icon;
        Colour = colour;
        SortOrder = sortOrder;
        BudgetAmount = Money.Budget(budgetAmount);
        SpreadEvenly = spreadEvenly;
        AutoPay = autoPay;
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

    // A bill whose money is set aside the day a cycle starts: rollover records it as paid (AutoPayment). Only for a
    // bill paid in one go, and (checked where the Type is known, CycleCategories) only on a Debit category.
    public bool AutoPay { get; private set; }

    public void Edit(string name, string icon, string colour, int sortOrder, decimal budgetAmount, bool spreadEvenly, bool autoPay)
    {
        EnsureAutoPayIsABill(spreadEvenly, autoPay);
        BudgetAmount = Money.Budget(budgetAmount);
        Name = name;
        Icon = icon;
        Colour = colour;
        SortOrder = sortOrder;
        SpreadEvenly = spreadEvenly;
        AutoPay = autoPay;
    }

    public CycleCategory CopyTo(Cycle next) => new(next, CategoryId, Name, Icon, Colour, SortOrder, BudgetAmount, SpreadEvenly, AutoPay);

    // The transaction rollover adds for an AutoPay bill: an ordinary transaction, so the user can edit or delete it
    // when the bill differed that month. The ClientId is derived from (cycle, category), so a second attempt at the
    // same payment hits the (UserId, ClientId) unique index instead of paying twice.
    public Transaction? AutoPayment(Cycle cycle, DateTimeOffset now)
    {
        if (cycle.Id != CycleId)
        {
            throw new ArgumentException("An auto payment belongs to the snapshot's own cycle.", nameof(cycle));
        }

        if (!AutoPay || BudgetAmount == 0m)
        {
            return null;
        }

        return new Transaction(cycle, CategoryId, BudgetAmount, cycle.StartDate, AutoPaymentNote, AutoPaymentClientId(), now);
    }

    // Whether transactions exist is a repository question, so the caller passes the answer in.
    public void EnsureRemovable(bool hasTransactions)
    {
        if (hasTransactions)
        {
            throw new DomainException("category.has-transactions", "A category with transactions in this cycle cannot be removed from it.");
        }
    }

    private Guid AutoPaymentClientId()
    {
        Span<byte> key = stackalloc byte[32];
        CycleId.TryWriteBytes(key[..16]);
        CategoryId.TryWriteBytes(key[16..]);
        return new Guid(SHA256.HashData(key)[..16]);
    }

    private static void EnsureAutoPayIsABill(bool spreadEvenly, bool autoPay)
    {
        if (autoPay && spreadEvenly)
        {
            throw new DomainException("category.auto-pay-spread", "Only a bill paid in one go can be marked as paid when a new cycle starts.");
        }
    }
}
