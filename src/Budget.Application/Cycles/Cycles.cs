using Budget.Domain;
using Microsoft.Extensions.Logging;

namespace Budget.Application;

public sealed record CycleDto(
    Guid Id,
    DateOnly StartDate,
    DateOnly EndDate,
    CycleStatus Status,
    CyclePhase Phase,
    decimal? OpeningBalance,
    decimal? ClosingBalance);

public sealed record CycleSummaryDto(CycleDto Cycle, CycleRollup Rollup);

public sealed class Cycles(
    ICycleRepository cycles,
    ICategoryRepository categories,
    ITransactionRepository transactions,
    UserToday today,
    RolloverCycles rollover,
    ILogger<Cycles> logger)
{
    public async Task<IReadOnlyList<CycleDto>> ListAsync(CancellationToken ct = default)
    {
        var now = await today.GetAsync(ct);
        var timeline = new CycleTimeline(await cycles.ListAsync(ct));
        return [.. timeline.Cycles.Select(c => ToDto(c, timeline, now))];
    }

    public async Task<CycleSummaryDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var now = await today.GetAsync(ct);
        var timeline = new CycleTimeline(await cycles.ListAsync(ct));
        var cycle = timeline.Cycles.SingleOrDefault(c => c.Id == id) ?? throw new NotFoundException("cycle.not-found", "Cycle not found.");
        return await SummaryAsync(cycle, timeline, now, ct);
    }

    // The fallback rollover trigger: a late or failed job must never leave the app without a current cycle.
    public async Task<CycleSummaryDto> GetCurrentAsync(CancellationToken ct = default)
    {
        var created = await rollover.RunAsync(ct);
        if (created > 0)
        {
            logger.LogWarning("Rollover fallback created {Count} cycle(s) at request time; the rollover job is behind.", created);
        }

        var now = await today.GetAsync(ct);
        var timeline = new CycleTimeline(await cycles.ListAsync(ct));
        var current = timeline.Current(now) ?? throw new NotFoundException("cycle.none", "There is no current cycle yet.");
        return await SummaryAsync(current, timeline, now, ct);
    }

    private async Task<CycleSummaryDto> SummaryAsync(Cycle cycle, CycleTimeline timeline, DateOnly now, CancellationToken ct)
    {
        var rollup = CycleRollup.Calculate(
            cycle,
            await categories.ListForCycleAsync(cycle.Id, ct),
            await categories.ListAsync(ct),
            await transactions.ListForCycleAsync(cycle.Id, null, ct));
        return new CycleSummaryDto(ToDto(cycle, timeline, now), rollup);
    }

    private static CycleDto ToDto(Cycle cycle, CycleTimeline timeline, DateOnly now) =>
        new(cycle.Id, cycle.StartDate, cycle.EndDate, cycle.Status, timeline.PhaseOf(cycle, now), cycle.OpeningBalance, cycle.ClosingBalance);
}
