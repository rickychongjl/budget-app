namespace Budget.Domain;

// The store's view of a subscription, as the billing notifications report it. Stored as text (SubscriptionCodes).
public enum SubscriptionStatus
{
    Trialing,
    Active,

    // A renewal payment failed; Premium continues for Plans.PastDueGrace after the period end.
    PastDue,
    Cancelled,
    Expired,
}
