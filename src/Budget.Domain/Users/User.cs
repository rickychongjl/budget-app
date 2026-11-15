namespace Budget.Domain;

public sealed class User
{
    public User(
        string displayName, string timeZone, string currency, DateTimeOffset createdAt, string? externalId = null, bool isDemo = false, string? email = null)
    {
        DisplayName = displayName;
        TimeZone = Known(timeZone);
        Currency = currency;
        CreatedAt = createdAt;
        ExternalId = externalId;
        IsDemo = isDemo;
        Email = email;
    }

    public Guid Id { get; } = Guid.NewGuid();
    // Provider-qualified ("google:<sub>"); null for the demo user. A bare value is an Entra oid from before Google sign-in.
    public string? ExternalId { get; private set; }
    public string DisplayName { get; private set; }
    public bool IsDemo { get; }
    public string TimeZone { get; private set; }
    public string Currency { get; }
    public DateTimeOffset CreatedAt { get; }

    // From the sign-in token, refreshed on every sign-in; may be absent. Personal data: never logged.
    public string? Email { get; private set; }

    public void Rename(string displayName) => DisplayName = displayName;

    public void ChangeEmail(string? email) => Email = email;

    // Points this row at a different sign-in. The id, and so every tenant row, stays: this is how an account moves provider.
    public void LinkTo(string externalId)
    {
        if (IsDemo)
        {
            throw new DomainException("user.demo.unlinkable", "The demo user cannot be linked to a sign-in.");
        }

        if (string.IsNullOrWhiteSpace(externalId))
        {
            throw new DomainException("user.external-id.blank", "An external id is required.");
        }

        ExternalId = externalId;
    }

    // Changes what "today" is from now on. Stored cycles keep their dates; only which one is current can shift.
    public void ChangeTimeZone(string timeZone) => TimeZone = Known(timeZone);

    private static string Known(string timeZone) =>
        TimeZoneInfo.TryFindSystemTimeZoneById(timeZone, out _)
            ? timeZone
            : throw new DomainException("user.timezone.unknown", $"'{timeZone}' is not a known IANA time zone.");

    // "Today" decides which cycle is current, so it is always the user's local date.
    public DateOnly Today(TimeProvider clock)
    {
        var local = TimeZoneInfo.ConvertTime(clock.GetUtcNow(), TimeZoneInfo.FindSystemTimeZoneById(TimeZone));
        return DateOnly.FromDateTime(local.DateTime);
    }
}
