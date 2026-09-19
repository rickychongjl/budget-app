using Budget.Domain;

namespace Budget.Application;

// A cycle is never judged alone: whether it can be edited depends on its place in the timeline and on today.
public sealed class CycleFinder(ICycleRepository cycles, UserToday today)
{
    public async Task<(CycleTimeline Timeline, DateOnly Today)> TimelineAsync(CancellationToken ct = default)
    {
        var now = await today.GetAsync(ct);
        return (new CycleTimeline(await cycles.ListAsync(ct)), now);
    }

    public async Task<(Cycle Cycle, CycleTimeline Timeline, DateOnly Today)> FindAsync(Guid id, CancellationToken ct = default)
    {
        var (timeline, now) = await TimelineAsync(ct);
        var cycle = timeline.Cycles.SingleOrDefault(c => c.Id == id) ?? throw new NotFoundException("cycle.not-found", "Cycle not found.");
        return (cycle, timeline, now);
    }
}
