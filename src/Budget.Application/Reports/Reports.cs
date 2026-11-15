using Budget.Domain;

namespace Budget.Application;

// Every cycle with its rollup: the same shape GET /api/cycles/{id} returns, once per cycle, so the trend chart
// and the cycle list read one answer and cannot disagree. Four queries however many cycles there are, because
// the per-category sums come from the database instead of the transactions themselves.
//
// On Free the answer is trimmed to the cycles Entitlement.Reportable allows (every cycle that is not over, plus the most
// recent past one), rather than refused: the Cycles page still works, and older cycles are only left out, never deleted.
//
// It must never trigger rollover: GET /api/cycles/current is the request-time fallback and nothing else is.
public sealed class Reports(ICategoryRepository categories, ITransactionRepository transactions, CycleFinder finder, Entitlements entitlements)
{
    // ponytail: unbounded, about twelve cycles a year. Add ?last=N when someone has five years of history.
    public async Task<IReadOnlyList<CycleSummaryDto>> ListAsync(CancellationToken ct = default)
    {
        var (timeline, today) = await finder.TimelineAsync(ct);
        if (timeline.Cycles.Count == 0)
        {
            return [];
        }

        var reportable = (await entitlements.GetAsync(ct)).Reportable(timeline, today);
        var identities = await categories.ListAsync(ct);
        var snapshots = (await categories.ListForAllCyclesAsync(ct)).ToLookup(s => s.CycleId);
        var totals = (await transactions.SumByCategoryAsync(ct)).ToLookup(t => t.CycleId);

        return
        [
            .. reportable.Select(cycle => new CycleSummaryDto(
                CycleDto.From(cycle, timeline, today),
                CycleRollup.Calculate(
                    cycle,
                    snapshots[cycle.Id],
                    identities,
                    totals[cycle.Id].ToDictionary(t => t.CategoryId, t => t.Total))))
        ];
    }
}
