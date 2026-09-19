using Budget.Domain;

namespace Budget.Application;

// The demo user is public and shared, so its data is bounded. It is a normal user everywhere else;
// these limits are the only place IsDemo changes behaviour. The nightly reset clears whatever accumulates.
public sealed class DemoCaps(ICurrentUser currentUser, IUserRepository users, ICategoryRepository categories, ITransactionRepository transactions)
{
    public const int MaxCategories = 20;
    public const int MaxTransactions = 500;
    public const int MaxNoteLength = 200;

    public async Task EnsureCanAddCategoryAsync(CancellationToken ct = default)
    {
        if (await IsDemoAsync(ct) && (await categories.ListAsync(ct)).Count >= MaxCategories)
        {
            throw new DomainException("demo.cap.categories", $"The demo is limited to {MaxCategories} categories.");
        }
    }

    public async Task EnsureCanAddTransactionAsync(CancellationToken ct = default)
    {
        if (await IsDemoAsync(ct) && await transactions.CountAsync(ct) >= MaxTransactions)
        {
            throw new DomainException("demo.cap.transactions", $"The demo is limited to {MaxTransactions} transactions.");
        }
    }

    public async Task EnsureNoteAllowedAsync(string? note, CancellationToken ct = default)
    {
        if (note?.Length > MaxNoteLength && await IsDemoAsync(ct))
        {
            throw new DomainException("demo.cap.note", $"Notes in the demo are limited to {MaxNoteLength} characters.");
        }
    }

    private async Task<bool> IsDemoAsync(CancellationToken ct) => (await users.GetAsync(currentUser.Id, ct))?.IsDemo == true;
}
