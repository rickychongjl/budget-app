using Budget.Application;
using Budget.Domain;
using Microsoft.EntityFrameworkCore;

namespace Budget.Infrastructure;

public sealed class TransactionRepository(BudgetDbContext db) : ITransactionRepository
{
    public async Task<IReadOnlyList<Transaction>> ListForCycleAsync(Guid cycleId, Guid? categoryId = null, CancellationToken ct = default) =>
        await db.Transactions
            .Where(t => t.CycleId == cycleId && (categoryId == null || t.CategoryId == categoryId))
            .OrderByDescending(t => t.OccurredOn).ThenByDescending(t => t.CreatedAt)
            .ToListAsync(ct);

    public Task<Transaction?> GetAsync(Guid id, CancellationToken ct = default) =>
        db.Transactions.SingleOrDefaultAsync(t => t.Id == id, ct);

    public Task<Transaction?> GetByClientIdAsync(Guid clientId, CancellationToken ct = default) =>
        db.Transactions.SingleOrDefaultAsync(t => t.ClientId == clientId, ct);

    public Task<int> CountAsync(CancellationToken ct = default) => db.Transactions.CountAsync(ct);

    public Task<bool> AnyForCategoryAsync(Guid cycleId, Guid categoryId, CancellationToken ct = default) =>
        db.Transactions.AnyAsync(t => t.CycleId == cycleId && t.CategoryId == categoryId, ct);

    public void Add(Transaction transaction) => db.Transactions.Add(transaction);

    public void Remove(Transaction transaction) => db.Transactions.Remove(transaction);
}
