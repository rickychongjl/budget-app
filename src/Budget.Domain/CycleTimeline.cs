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

    public void EnsureCanEdit(Cycle cycle, CycleEdit edit, DateOnly today)
    {
        // Onboarding: the draft is set up freely, wherever its dates fall, but takes no transactions.
        if (cycle.Status == CycleStatus.Draft)
        {
            if (edit == CycleEdit.Transactions)
            {
                throw new DomainException("cycle.draft", "Transactions need a confirmed cycle.");
            }

            return;
        }

        var phase = PhaseOf(cycle, today);
        var allowed = phase switch
        {
            CyclePhase.Past => edit is CycleEdit.ClosingBalance or CycleEdit.Transactions,
            CyclePhase.Future => edit is CycleEdit.Categories,
            _ => true,
        };

        if (!allowed)
        {
            throw new DomainException(
                phase == CyclePhase.Past ? "cycle.past.readonly" : "cycle.future.readonly",
                $"{edit} cannot be changed on a {phase.ToString().ToLowerInvariant()} cycle.");
        }
    }

    // A past-cycle transaction write is allowed, but the UI should prompt for a closing balance update.
    public bool RequiresClosingBalanceReview(Cycle cycle, DateOnly today) => PhaseOf(cycle, today) == CyclePhase.Past;

    // Transactions are deliberately not involved: they keep their CycleId whatever the new dates are.
    public void MoveStart(Cycle cycle, DateOnly newStart, DateOnly today)
    {
        EnsureCanEdit(cycle, CycleEdit.StartDate, today);

        var index = _cycles.IndexOf(cycle);
        if (index < 0)
        {
            throw new ArgumentException("The cycle is not part of this timeline.", nameof(cycle));
        }

        if (index > 0 && newStart <= _cycles[index - 1].EndDate)
        {
            throw new DomainException("cycle.start.overlap", "A cycle must start after the previous cycle ends.");
        }

        // Otherwise one edit would turn the current cycle into a past one and trigger a rollover.
        if (cycle.Status == CycleStatus.Confirmed && newStart.AddDays(Cycle.LengthInDays - 1) < today)
        {
            throw new DomainException("cycle.start.ends-before-today", "The current cycle cannot be moved so that it has already ended.");
        }

        cycle.MoveTo(newStart);
        for (var i = index + 1; i < _cycles.Count; i++)
        {
            _cycles[i].MoveTo(_cycles[i - 1].StartDate.AddDays(Cycle.LengthInDays));
        }
    }

    public void SetOpeningBalance(Cycle cycle, decimal amount, DateOnly today)
    {
        EnsureCanEdit(cycle, CycleEdit.OpeningBalance, today);
        cycle.SetOpeningBalance(Money.Balance(amount));
    }

    public void SetClosingBalance(Cycle cycle, decimal amount, DateOnly today)
    {
        EnsureCanEdit(cycle, CycleEdit.ClosingBalance, today);
        cycle.SetClosingBalance(Money.Balance(amount));
    }
}
