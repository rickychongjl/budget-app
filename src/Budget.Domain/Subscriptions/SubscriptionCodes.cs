namespace Budget.Domain;

// The text stored for each value, and the database's check constraints are written from the same lists.
// Lower snake case, the way the stores name them, so a row reads the same in SQL as in a billing notification.
public static class SubscriptionCodes
{
    public static readonly IReadOnlyList<string> Sources = ["app_store", "google_play", "manual"];
    public static readonly IReadOnlyList<string> Statuses = ["trialing", "active", "past_due", "cancelled", "expired"];
    public static readonly IReadOnlyList<string> PlanCodes = ["premium"];

    public static string Of(SubscriptionSource source) => Sources[(int)source];

    public static string Of(SubscriptionStatus status) => Statuses[(int)status];

    public static string Of(Plan plan) => plan == Plan.Premium ? PlanCodes[0] : throw Unknown(plan.ToString());

    public static SubscriptionSource ParseSource(string code) => (SubscriptionSource)IndexOf(Sources, code);

    public static SubscriptionStatus ParseStatus(string code) => (SubscriptionStatus)IndexOf(Statuses, code);

    public static Plan ParsePlan(string code) => code == PlanCodes[0] ? Plan.Premium : throw Unknown(code);

    private static int IndexOf(IReadOnlyList<string> codes, string code)
    {
        for (var i = 0; i < codes.Count; i++)
        {
            if (codes[i] == code)
            {
                return i;
            }
        }

        throw Unknown(code);
    }

    private static DomainException Unknown(string code) => new("subscription.code.unknown", $"'{code}' is not a known subscription value.");
}
