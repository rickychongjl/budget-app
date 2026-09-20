using Budget.Domain;

namespace Budget.Application;

public interface ICategoryRepository
{
    Task<IReadOnlyList<Category>> ListAsync(CancellationToken ct = default);
    Task<Category?> GetAsync(Guid id, CancellationToken ct = default);
    void Add(Category category);

    // The per-cycle snapshots, in SortOrder.
    Task<IReadOnlyList<CycleCategory>> ListForCycleAsync(Guid cycleId, CancellationToken ct = default);

    // Every cycle's snapshots in one query: the report's, so it does not ask per cycle.
    Task<IReadOnlyList<CycleCategory>> ListForAllCyclesAsync(CancellationToken ct = default);
    Task<CycleCategory?> GetForCycleAsync(Guid cycleId, Guid categoryId, CancellationToken ct = default);
    void Add(CycleCategory cycleCategory);
    void Remove(CycleCategory cycleCategory);
}
