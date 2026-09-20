using Budget.Domain;

namespace Budget.Application;

// Every cycle with its rollup: the same shape GET /api/cycles/{id} returns, once per cycle, so the trend chart
// and the cycle list read one answer and cannot disagree. Four queries however many cycles there are, because
// the per-category sums come from the database instead of the transactions themselves.
//
// It must never trigger rollover: GET /api/cycles/current is the request-time fallback and nothing else is.
public sealed class Reports(ICategoryRepository categories, ITransactionRepository transactions, CycleFinder finder)
{
    // ponytail: unbounded, about twelve cycles a year. Add ?last=N when someone has five years of history.
    public async Task<IReadOnlyList<CycleSummaryDto>> ListAsync(CancellationToken ct = default)
    {
        var (timeline, today) = await finder.TimelineAsync(ct);
        if (timeline.Cycles.Count == 0)
        {
            return [];
        }

        var identities = await categories.ListAsync(ct);
        var snapshots = (await categories.ListForAllCyclesAsync(ct)).ToLookup(s => s.CycleId);
        var totals = (await transactions.SumByCategoryAsync(ct)).ToLookup(t => t.CycleId);

        return
        [
            .. timeline.Cycles.Select(cycle => new CycleSummaryDto(
                CycleDto.From(cycle, timeline, today),
                CycleRollup.Calculate(
                    cycle,
                    snapshots[cycle.Id],
                    identities,
                    totals[cycle.Id].ToDictionary(t => t.CategoryId, t => t.Total))))
        ];
    }
}
