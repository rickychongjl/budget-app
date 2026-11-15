namespace Budget.Domain;

// Why a user has Premium. Shown to the user and the support desk; never changes what Premium allows.
public enum PremiumSource
{
    // The shared demo shows everything; DemoCaps still bounds it.
    Demo,

    // Plans:ComplimentaryPremiumEmails names the account's verified email.
    Complimentary,

    // A store subscription that is trialing, active, or past due within the grace.
    Subscription,
}
