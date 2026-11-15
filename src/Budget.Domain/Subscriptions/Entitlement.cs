namespace Budget.Domain;

// What the current user's plan allows, and why. Worked out on every request (Entitlements), never stored, so a
// subscription that lapses or a setting that changes takes effect at once.
public sealed record Entitlement(Plan Plan, PremiumSource? Source)
{
    public static readonly Entitlement Free = new(Plan.Free, null);

    public PlanLimits Limits => Plans.LimitsFor(Plan);

    // The demo first, so interview demos show everything; then a complimentary account; then any subscription that
    // still grants Premium. A subscription belonging to someone else is ignored, whatever the caller passed in.
    public static Entitlement Resolve(User user, bool complimentary, IEnumerable<Subscription> subscriptions, DateTimeOffset now)
    {
        if (user.IsDemo)
        {
            return new(Plan.Premium, PremiumSource.Demo);
        }

        if (complimentary)
        {
            return new(Plan.Premium, PremiumSource.Complimentary);
        }

        return subscriptions.Any(s => s.UserId == user.Id && s.GrantsPremium(now)) ? new(Plan.Premium, PremiumSource.Subscription) : Free;
    }

    // A cycle already over the limit (a downgraded user) keeps every category it has; it just takes no more.
    public void EnsureCanAddCategory(int categoriesInCycle)
    {
        if (Limits.MaxCategoriesPerCycle is { } max && categoriesInCycle >= max)
        {
            throw new DomainException(
                "plan.limit.categories", $"The Free plan has up to {max} categories in a cycle. Premium has no limit.");
        }
    }

    // The cycles GET /api/reports/cycles may show, oldest first: every cycle that is not over, plus the most recent
    // PastCyclesInReports that are. The rest are only left out of the report; nothing is deleted.
    public IReadOnlyList<Cycle> Reportable(CycleTimeline timeline, DateOnly today)
    {
        if (Limits.PastCyclesInReports is not { } keep)
        {
            return timeline.Cycles;
        }

        var past = timeline.Cycles.Where(c => timeline.PhaseOf(c, today) == CyclePhase.Past).ToList();
        var hidden = past.Take(Math.Max(0, past.Count - keep)).ToHashSet();
        return [.. timeline.Cycles.Where(c => !hidden.Contains(c))];
    }
}
