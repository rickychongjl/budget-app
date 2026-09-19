namespace Budget.Domain.Tests;

internal static class TestData
{
    public static readonly Guid UserId = Guid.NewGuid();
    public static readonly DateTimeOffset Now = new(2026, 1, 10, 0, 0, 0, TimeSpan.Zero);

    public static Cycle Confirmed(DateOnly start)
    {
        var cycle = new Cycle(UserId, start);
        cycle.Confirm();
        return cycle;
    }

    // Back-to-back confirmed cycles: 1 Jan, 31 Jan, 2 Mar 2026, ...
    public static CycleTimeline Chain(int count, DateOnly? firstStart = null)
    {
        var cycles = new List<Cycle> { Confirmed(firstStart ?? new DateOnly(2026, 1, 1)) };
        while (cycles.Count < count)
        {
            cycles.Add(cycles[^1].CreateNext());
        }

        return new CycleTimeline(cycles);
    }
}

internal sealed class FixedClock(DateTimeOffset utcNow) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => utcNow;
}
