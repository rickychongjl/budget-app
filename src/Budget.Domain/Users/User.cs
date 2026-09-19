namespace Budget.Domain;

public sealed class User
{
    public User(string displayName, string timeZone, string currency, DateTimeOffset createdAt, string? externalId = null, bool isDemo = false)
    {
        DisplayName = displayName;
        TimeZone = Known(timeZone);
        Currency = currency;
        CreatedAt = createdAt;
        ExternalId = externalId;
        IsDemo = isDemo;
    }

    public Guid Id { get; } = Guid.NewGuid();
    public string? ExternalId { get; }
    public string DisplayName { get; private set; }
    public bool IsDemo { get; }
    public string TimeZone { get; private set; }
    public string Currency { get; }
    public DateTimeOffset CreatedAt { get; }

    public void Rename(string displayName) => DisplayName = displayName;

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
