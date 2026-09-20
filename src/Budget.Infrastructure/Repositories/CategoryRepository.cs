using Budget.Application;
using Budget.Domain;
using Microsoft.EntityFrameworkCore;

namespace Budget.Infrastructure;

public sealed class CategoryRepository(BudgetDbContext db) : ICategoryRepository
{
    public async Task<IReadOnlyList<Category>> ListAsync(CancellationToken ct = default) =>
        await db.Categories.OrderBy(c => c.CreatedAt).ToListAsync(ct);

    public Task<Category?> GetAsync(Guid id, CancellationToken ct = default) =>
        db.Categories.SingleOrDefaultAsync(c => c.Id == id, ct);

    public void Add(Category category) => db.Categories.Add(category);

    public async Task<IReadOnlyList<CycleCategory>> ListForCycleAsync(Guid cycleId, CancellationToken ct = default) =>
        await db.CycleCategories.Where(c => c.CycleId == cycleId).OrderBy(c => c.SortOrder).ToListAsync(ct);

    public async Task<IReadOnlyList<CycleCategory>> ListForAllCyclesAsync(CancellationToken ct = default) =>
        await db.CycleCategories.OrderBy(c => c.SortOrder).ToListAsync(ct);

    public Task<CycleCategory?> GetForCycleAsync(Guid cycleId, Guid categoryId, CancellationToken ct = default) =>
        db.CycleCategories.SingleOrDefaultAsync(c => c.CycleId == cycleId && c.CategoryId == categoryId, ct);

    public void Add(CycleCategory cycleCategory) => db.CycleCategories.Add(cycleCategory);

    public void Remove(CycleCategory cycleCategory) => db.CycleCategories.Remove(cycleCategory);
}
