namespace Budget.Application;

// The Entra object ids that may sign in, from configuration (Auth:AllowedOids). Empty admits nobody.
// Held lower-case, which is also how User.ExternalId is stored, so a token's casing never matters.
public sealed class AllowedOids(IEnumerable<string> values)
{
    public IReadOnlySet<string> Values { get; } =
        values.Where(v => !string.IsNullOrWhiteSpace(v)).Select(Normalise).ToHashSet();

    public static string Normalise(string oid) => oid.Trim().ToLowerInvariant();
}
