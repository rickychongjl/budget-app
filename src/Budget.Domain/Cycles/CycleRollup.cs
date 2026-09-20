namespace Budget.Domain;

public enum RollupStatus
{
    OnTrack,

    // A Debit category that spent more than its limit (red).
    Over,

    // A Credit category that received more than expected (green).
    Ahead,
}

// PercentUsed is unrounded (the UI formats it) and null when nothing was budgeted.
public sealed record CategoryRollup(
    Guid CategoryId,
    string Name,
    string Icon,
    string Colour,
    CategoryType Type,
    decimal Budgeted,
    decimal Actual,
    decimal Remaining,
    decimal? PercentUsed,
    RollupStatus Status);

public sealed record CycleRollup(
    IReadOnlyList<CategoryRollup> Categories,
    decimal DebitsBudgeted,
    decimal DebitsActual,
    decimal CreditsBudgeted,
    decimal CreditsActual,
    decimal Net,
    decimal? Accrued)
{
    // Inputs may hold rows for other cycles; they are ignored.
    public static CycleRollup Calculate(
        Cycle cycle,
        IEnumerable<CycleCategory> cycleCategories,
        IEnumerable<Category> categories,
        IEnumerable<Transaction> transactions) =>
        Calculate(
            cycle,
            cycleCategories,
            categories,
            transactions
                .Where(t => t.CycleId == cycle.Id)
                .GroupBy(t => t.CategoryId)
                .ToDictionary(g => g.Key, g => g.Sum(t => t.Amount)));

    // The report sums in SQL rather than loading every transaction, so it hands the totals straight in.
    // Totals are this cycle's alone: unlike the transaction overload there is no CycleId to filter on.
    public static CycleRollup Calculate(
        Cycle cycle,
        IEnumerable<CycleCategory> cycleCategories,
        IEnumerable<Category> categories,
        IReadOnlyDictionary<Guid, decimal> actuals)
    {
        var types = categories.ToDictionary(c => c.Id, c => c.Type);
        var snapshots = cycleCategories.Where(c => c.CycleId == cycle.Id).OrderBy(c => c.SortOrder).ToList();

        var orphan = actuals.Keys.Except(snapshots.Select(s => s.CategoryId)).FirstOrDefault();
        if (orphan != default)
        {
            throw new InvalidOperationException($"Cycle {cycle.Id} has transactions in category {orphan}, which it does not contain.");
        }

        var lines = snapshots.Select(s => Line(s, types, actuals.GetValueOrDefault(s.CategoryId))).ToList();
        var debits = lines.Where(l => l.Type == CategoryType.Debit).ToList();
        var credits = lines.Where(l => l.Type == CategoryType.Credit).ToList();

        return new CycleRollup(
            lines,
            debits.Sum(l => l.Budgeted),
            debits.Sum(l => l.Actual),
            credits.Sum(l => l.Budgeted),
            credits.Sum(l => l.Actual),
            credits.Sum(l => l.Actual) - debits.Sum(l => l.Actual),
            cycle.ClosingBalance - cycle.OpeningBalance);
    }

    private static CategoryRollup Line(CycleCategory snapshot, Dictionary<Guid, CategoryType> types, decimal actual)
    {
        if (!types.TryGetValue(snapshot.CategoryId, out var type))
        {
            throw new InvalidOperationException($"Category {snapshot.CategoryId} was not supplied.");
        }

        var budgeted = snapshot.BudgetAmount;
        var status = actual <= budgeted
            ? RollupStatus.OnTrack
            : type == CategoryType.Debit ? RollupStatus.Over : RollupStatus.Ahead;

        return new CategoryRollup(
            snapshot.CategoryId,
            snapshot.Name,
            snapshot.Icon,
            snapshot.Colour,
            type,
            budgeted,
            actual,
            budgeted - actual,
            budgeted == 0m ? null : actual / budgeted * 100m,
            status);
    }
}
