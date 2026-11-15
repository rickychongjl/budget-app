namespace Budget.Application;

// Plans:ComplimentaryPremiumEmails: comma-separated addresses whose accounts get Premium without a subscription (the
// owner's own account, say). Matched against User.Email, which only ever holds an address the provider verified,
// ignoring case and surrounding spaces. Empty (the default) grants nothing. Never commit a real address to it.
public sealed class PlanSettings
{
    private readonly HashSet<string> _complimentary;

    public PlanSettings(string? complimentaryPremiumEmails = null) =>
        _complimentary = new HashSet<string>(
            (complimentaryPremiumEmails ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            StringComparer.OrdinalIgnoreCase);

    public bool IsComplimentary(string? email) => email is not null && _complimentary.Contains(email.Trim());
}
