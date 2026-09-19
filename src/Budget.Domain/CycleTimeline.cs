namespace Budget.Domain;

// All of one user's cycles. Rules that need more than one cycle live here.
public sealed class CycleTimeline
{
    private readonly List<Cycle> _cycles;

    public CycleTimeline(IEnumerable<Cycle> cycles)
    {
        _cycles = [.. cycles.OrderBy(c => c.StartDate)];
    }

    public IReadOnlyList<Cycle> Cycles => _cycles;

    public Cycle? Current(DateOnly today) => _cycles.FirstOrDefault(c => c.EndDate >= today);

    public CyclePhase PhaseOf(Cycle cycle, DateOnly today)
    {
        var current = Current(today);
        if (current is null || cycle.StartDate < current.StartDate)
        {
            return CyclePhase.Past;
        }

        return cycle.StartDate == current.StartDate ? CyclePhase.Current : CyclePhase.Future;
    }
}
