using Budget.Application;
using Budget.Domain;
using Microsoft.EntityFrameworkCore;

namespace Budget.Infrastructure;

// No userId arguments here or in the other repositories: the context's query filter decides tenancy.
public sealed class CycleRepository(BudgetDbContext db) : ICycleRepository
{
    public async Task<IReadOnlyList<Cycle>> ListAsync(CancellationToken ct = default) =>
        await db.Cycles.OrderBy(c => c.StartDate).ToListAsync(ct);

    public Task<Cycle?> GetAsync(Guid id, CancellationToken ct = default) =>
        db.Cycles.SingleOrDefaultAsync(c => c.Id == id, ct);

    public void Add(Cycle cycle) => db.Cycles.Add(cycle);
}
