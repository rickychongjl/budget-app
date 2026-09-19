using Budget.Domain;

namespace Budget.Application;

public interface ITransactionRepository
{
    // Newest first.
    Task<IReadOnlyList<Transaction>> ListForCycleAsync(Guid cycleId, Guid? categoryId = null, CancellationToken ct = default);
    Task<Transaction?> GetAsync(Guid id, CancellationToken ct = default);

    // Offline sync replays a create with the same ClientId; this finds the original.
    Task<Transaction?> GetByClientIdAsync(Guid clientId, CancellationToken ct = default);
    Task<bool> AnyForCategoryAsync(Guid cycleId, Guid categoryId, CancellationToken ct = default);
    void Add(Transaction transaction);
    void Remove(Transaction transaction);
}
