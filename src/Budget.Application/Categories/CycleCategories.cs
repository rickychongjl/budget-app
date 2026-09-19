using Budget.Domain;
using FluentValidation;

namespace Budget.Application;

public sealed record CycleCategoryDto(Guid CategoryId, CategoryType Type, string Name, string Icon, string Colour, int SortOrder, decimal BudgetAmount);

// The stable identity with its most recent name: what a report filter lists.
public sealed record CategoryIdentityDto(Guid Id, CategoryType Type, string Name);

public sealed class CycleCategories(
    ICurrentUser currentUser,
    IUnitOfWork unitOfWork,
    ICategoryRepository categories,
    ITransactionRepository transactions,
    CycleFinder finder,
    DemoCaps demoCaps,
    TimeProvider clock)
{
    public async Task<CycleCategoryDto> AddAsync(Guid cycleId, AddCategoryRequest request, CancellationToken ct = default)
    {
        AddCategoryValidator.Instance.ValidateAndThrow(request);

        var (cycle, timeline, today) = await finder.FindAsync(cycleId, ct);
        timeline.EnsureCanEdit(cycle, CycleEdit.Categories, today);

        Category category;
        if (request.CategoryId is { } existingId)
        {
            category = await categories.GetAsync(existingId, ct) ?? throw NotFound();
            if (await categories.GetForCycleAsync(cycleId, existingId, ct) is not null)
            {
                throw new DomainException("category.in-cycle", "The category is already in this cycle.");
            }
        }
        else
        {
            await demoCaps.EnsureCanAddCategoryAsync(ct);
            category = new Category(currentUser.Id, request.Type!.Value, clock.GetUtcNow());
            categories.Add(category);
        }

        var snapshot = new CycleCategory(cycle, category.Id, request.Name, request.Icon, request.Colour, request.SortOrder, request.BudgetAmount);
        categories.Add(snapshot);
        await unitOfWork.SaveChangesAsync(ct);
        return ToDto(snapshot, category);
    }

    public async Task<CycleCategoryDto> EditAsync(Guid cycleId, Guid categoryId, EditCategoryRequest request, CancellationToken ct = default)
    {
        EditCategoryValidator.Instance.ValidateAndThrow(request);

        var snapshot = await FindEditableAsync(cycleId, categoryId, ct);
        var category = await categories.GetAsync(categoryId, ct) ?? throw NotFound();
        snapshot.Edit(
            request.Name ?? snapshot.Name,
            request.Icon ?? snapshot.Icon,
            request.Colour ?? snapshot.Colour,
            request.SortOrder ?? snapshot.SortOrder,
            request.BudgetAmount ?? snapshot.BudgetAmount);
        await unitOfWork.SaveChangesAsync(ct);
        return ToDto(snapshot, category);
    }

    // Removes the category from this cycle only. The identity stays, because other cycles and reports still use it.
    public async Task RemoveAsync(Guid cycleId, Guid categoryId, CancellationToken ct = default)
    {
        var snapshot = await FindEditableAsync(cycleId, categoryId, ct);
        snapshot.EnsureRemovable(await transactions.AnyForCategoryAsync(cycleId, categoryId, ct));
        categories.Remove(snapshot);
        await unitOfWork.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<CategoryIdentityDto>> ListIdentitiesAsync(CancellationToken ct = default)
    {
        var identities = await categories.ListAsync(ct);
        var names = new Dictionary<Guid, string>();

        // ponytail: one query per cycle, newest first, stopping once every category has a name. About twelve
        // cycles a year; give ICategoryRepository a "latest snapshot per category" query if this shows up in traces.
        var (timeline, _) = await finder.TimelineAsync(ct);
        foreach (var cycle in timeline.Cycles.Reverse())
        {
            if (names.Count == identities.Count)
            {
                break;
            }

            foreach (var snapshot in await categories.ListForCycleAsync(cycle.Id, ct))
            {
                names.TryAdd(snapshot.CategoryId, snapshot.Name);
            }
        }

        // A category removed from the only cycle it was ever in has no name and nothing to report on.
        return [.. identities.Where(c => names.ContainsKey(c.Id)).Select(c => new CategoryIdentityDto(c.Id, c.Type, names[c.Id]))];
    }

    private async Task<CycleCategory> FindEditableAsync(Guid cycleId, Guid categoryId, CancellationToken ct)
    {
        var (cycle, timeline, today) = await finder.FindAsync(cycleId, ct);
        timeline.EnsureCanEdit(cycle, CycleEdit.Categories, today);
        return await categories.GetForCycleAsync(cycleId, categoryId, ct) ?? throw NotFound();
    }

    private static NotFoundException NotFound() => new("category.not-found", "Category not found.");

    private static CycleCategoryDto ToDto(CycleCategory snapshot, Category category) =>
        new(category.Id, category.Type, snapshot.Name, snapshot.Icon, snapshot.Colour, snapshot.SortOrder, snapshot.BudgetAmount);
}
