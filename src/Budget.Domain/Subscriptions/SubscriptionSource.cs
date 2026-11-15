namespace Budget.Domain;

// Who bills for a subscription. Stored as text (SubscriptionCodes), so a new store is a new value, not a migration.
public enum SubscriptionSource
{
    AppStore,
    GooglePlay,

    // Granted by hand, for example a refund made good or a beta tester.
    Manual,
}
