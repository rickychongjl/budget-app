namespace Budget.Domain;

// One store subscription (or a manual grant) for one user. A tenant row like any other. The billing notifications
// (L6, App Store and Google Play) are what create and update it; the browser never does. Rows are kept when they
// lapse: whether one still grants Premium is decided at read time, from its status and dates (GrantsPremium).
public sealed class Subscription
{
    public Subscription(
        Guid userId,
        SubscriptionSource source,
        string? externalId,
        SubscriptionStatus status,
        DateTimeOffset? currentPeriodEnd,
        DateTimeOffset? trialEnd,
        DateTimeOffset now)
    {
        UserId = userId;
        Source = source;
        ExternalId = externalId;
        Status = status;
        CurrentPeriodEnd = currentPeriodEnd;
        TrialEnd = trialEnd;
        CreatedAt = now;
        UpdatedAt = now;
    }

    // Persistence sets every property itself.
    private Subscription()
    {
    }

    public Guid Id { get; } = Guid.NewGuid();
    public Guid UserId { get; }
    public SubscriptionSource Source { get; }

    // The store's id for it (the App Store's original transaction id, Google Play's purchase token). None for a manual grant.
    public string? ExternalId { get; }
    public SubscriptionStatus Status { get; private set; }

    // Only one paid plan exists. Stored so a second one is a new value rather than a migration.
    public Plan Plan { get; } = Plan.Premium;
    public DateTimeOffset? CurrentPeriodEnd { get; private set; }
    public DateTimeOffset? TrialEnd { get; private set; }

    // The user has turned off renewal: Premium continues to the period end, then the store reports it expired.
    public bool CancelAtPeriodEnd { get; private set; }
    public DateTimeOffset CreatedAt { get; }
    public DateTimeOffset UpdatedAt { get; private set; }

    public void Update(SubscriptionStatus status, DateTimeOffset? currentPeriodEnd, DateTimeOffset? trialEnd, bool cancelAtPeriodEnd, DateTimeOffset now)
    {
        Status = status;
        CurrentPeriodEnd = currentPeriodEnd;
        TrialEnd = trialEnd;
        CancelAtPeriodEnd = cancelAtPeriodEnd;
        UpdatedAt = now;
    }

    // Trialing and active grant Premium until their end plus the grace, so a missed "expired" notification cannot grant
    // it for ever; a row with no end date yet (a manual grant) grants it until its status changes. Past due grants it
    // only within the grace after the period end. Cancelled and expired never do.
    public bool GrantsPremium(DateTimeOffset now) => Status switch
    {
        SubscriptionStatus.Trialing => Before(TrialEnd ?? CurrentPeriodEnd, now),
        SubscriptionStatus.Active => Before(CurrentPeriodEnd, now),
        SubscriptionStatus.PastDue => CurrentPeriodEnd is { } end && now <= end + Plans.Grace,
        _ => false,
    };

    private static bool Before(DateTimeOffset? end, DateTimeOffset now) => end is null || now <= end.Value + Plans.Grace;
}
