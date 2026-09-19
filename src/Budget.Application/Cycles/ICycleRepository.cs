using Budget.Domain;

namespace Budget.Application;

public interface ICycleRepository
{
    // Every cycle of the current user, oldest first: what CycleTimeline needs.
    Task<IReadOnlyList<Cycle>> ListAsync(CancellationToken ct = default);
    Task<Cycle?> GetAsync(Guid id, CancellationToken ct = default);
    void Add(Cycle cycle);
}
