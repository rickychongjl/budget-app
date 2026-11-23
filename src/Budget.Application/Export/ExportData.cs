using System.Globalization;
using Budget.Domain;

namespace Budget.Application;

public sealed record ProfileExport(string DisplayName, string? Email, string TimeZone, string Currency, bool IsDemo, DateTimeOffset CreatedAt);

public sealed record CycleCategoryExport(
    Guid CategoryId, string Name, CategoryType Type, decimal Budget, string Icon, string Colour, int Order, bool SpreadEvenly, bool AutoPay);

// Category is the name the category had in the transaction's own cycle, so a later rename does not rewrite history.
public sealed record TransactionExport(
    Guid Id, DateOnly Date, Guid CategoryId, string Category, CategoryType Type, decimal Amount, string? Note, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public sealed record CycleExport(
    Guid Id,
    DateOnly StartDate,
    DateOnly EndDate,
    CycleStatus Status,
    decimal? OpeningBalance,
    decimal? ClosingBalance,
    IReadOnlyList<CycleCategoryExport> Categories,
    IReadOnlyList<TransactionExport> Transactions);

// Everything the current user has entered, oldest cycle first. ExportArchive turns it into the downloadable ZIP.
public sealed record UserExport(DateOnly ExportedOn, DateTimeOffset ExportedAt, ProfileExport Profile, IReadOnlyList<CycleExport> Cycles)
{
    // Dated with the user's "today", like every other date the app shows them.
    public string FileName => $"tightarse-export-{ExportedOn.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)}.zip";
}

// GET /api/me/export. Reads only through the tenant-filtered repositories, so it can only ever see the caller's rows; the demo
// user is exported like anyone else. Four queries whatever the history: a user has at most a few thousand transactions.
public sealed class ExportData(
    ICurrentUser currentUser,
    IUserRepository users,
    ICycleRepository cycles,
    ICategoryRepository categories,
    ITransactionRepository transactions,
    TimeProvider clock)
{
    public async Task<UserExport> GetAsync(CancellationToken ct = default)
    {
        var user = await users.GetAsync(currentUser.Id, ct) ?? throw new NotFoundException("user.not-found", "User not found.");
        var types = (await categories.ListAsync(ct)).ToDictionary(c => c.Id, c => c.Type);
        var snapshots = (await categories.ListForAllCyclesAsync(ct)).ToLookup(s => s.CycleId);
        var byCycle = (await transactions.ListAllAsync(ct)).ToLookup(t => t.CycleId);

        var exported = (await cycles.ListAsync(ct)).Select(cycle =>
        {
            // (UserId, CycleId, CategoryId) is a key, so a category appears once per cycle.
            var inCycle = snapshots[cycle.Id].ToDictionary(s => s.CategoryId);
            return new CycleExport(
                cycle.Id,
                cycle.StartDate,
                cycle.EndDate,
                cycle.Status,
                cycle.OpeningBalance,
                cycle.ClosingBalance,
                [.. snapshots[cycle.Id].Select(s => new CycleCategoryExport(s.CategoryId, s.Name, types[s.CategoryId], s.BudgetAmount, s.Icon, s.Colour, s.SortOrder, s.SpreadEvenly, s.AutoPay))],
                [.. byCycle[cycle.Id].Select(t => new TransactionExport(
                    t.Id,
                    t.OccurredOn,
                    t.CategoryId,
                    inCycle.TryGetValue(t.CategoryId, out var snapshot) ? snapshot.Name : "",
                    types[t.CategoryId],
                    t.Amount,
                    t.Note,
                    t.CreatedAt.ToUniversalTime(),
                    t.UpdatedAt.ToUniversalTime()))]);
        });

        return new UserExport(
            user.Today(clock),
            clock.GetUtcNow(),
            new ProfileExport(user.DisplayName, user.Email, user.TimeZone, user.Currency, user.IsDemo, user.CreatedAt.ToUniversalTime()),
            [.. exported]);
    }
}
