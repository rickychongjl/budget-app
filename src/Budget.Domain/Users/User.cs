namespace Budget.Domain;

public sealed class User
{
    public User(string displayName, string timeZone, string currency, DateTimeOffset createdAt, string? externalId = null, bool isDemo = false)
    {
        if (!TimeZoneInfo.TryFindSystemTimeZoneById(timeZone, out _))
        {
            throw new DomainException("user.timezone.unknown", $"'{timeZone}' is not a known IANA time zone.");
        }

        DisplayName = displayName;
        TimeZone = timeZone;
        Currency = currency;
        CreatedAt = createdAt;
        ExternalId = externalId;
        IsDemo = isDemo;
    }

    public Guid Id { get; } = Guid.NewGuid();
    public string? ExternalId { get; }
    public string DisplayName { get; }
    public bool IsDemo { get; }
    public string TimeZone { get; }
    public string Currency { get; }
    public DateTimeOffset CreatedAt { get; }

    // "Today" decides which cycle is current, so it is always the user's local date.
    public DateOnly Today(TimeProvider clock)
    {
        var local = TimeZoneInfo.ConvertTime(clock.GetUtcNow(), TimeZoneInfo.FindSystemTimeZoneById(TimeZone));
        return DateOnly.FromDateTime(local.DateTime);
    }
}
