using Budget.Domain;

namespace Budget.Application;

// The only place cycles are rolled over. Two callers: the hourly job and GET /api/cycles/current.
public sealed class RolloverCycles(ICycleRepository cycles, ICategoryRepository categories, UserToday today, IUnitOfWork unitOfWork)
{
    // Returns how many cycles were created, so the request-time caller can tell that the job had fallen behind.
    public async Task<int> RunAsync(CancellationToken ct = default)
    {
        var now = await today.GetAsync(ct);

        var timeline = new CycleTimeline(await cycles.ListAsync(ct));
        if (timeline.Cycles.Count == 0)
        {
            return 0;
        }

        var latest = timeline.Cycles[^1];
        var result = timeline.RollForward(now, await categories.ListForCycleAsync(latest.Id, ct));
        if (result.Cycles.Count == 0)
        {
            return 0;
        }

        foreach (var cycle in result.Cycles)
        {
            cycles.Add(cycle);
        }

        foreach (var category in result.Categories)
        {
            categories.Add(category);
        }

        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (ConflictException)
        {
            // The other trigger created the same cycles first (unique index on UserId, StartDate). They exist, which is all that matters.
            return 0;
        }

        return result.Cycles.Count;
    }
}
