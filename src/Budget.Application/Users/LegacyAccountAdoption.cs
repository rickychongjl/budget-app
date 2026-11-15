using Budget.Domain;

namespace Budget.Application;

// Auth:AdoptLegacyUserEmail. Empty (the default) switches adoption off.
public sealed record LegacyAccountSettings(string? AdoptEmail);

// The original account was keyed by its Entra oid. Its owner's first Google sign-in, with the verified email the setting
// names, re-points that row at the Google subject instead of making a new, empty account, so the data stays where it is.
// Only when exactly one non-demo row still has a bare oid: anything else is ambiguous and falls through to an ordinary
// first sign-in. Once linked, the subject finds the row directly and this never matches again, so it is safe to leave on.
public sealed class LegacyAccountAdoption(IUserRepository users, LegacyAccountSettings settings)
{
    // Re-points the row in memory; the caller saves. Null when there is nothing to adopt.
    public async Task<User?> TryAdoptAsync(string externalId, string verifiedEmail, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(settings.AdoptEmail)
            || !string.Equals(settings.AdoptEmail.Trim(), verifiedEmail.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (await users.ListLegacyAsync(ct) is not [var legacy])
        {
            return null;
        }

        legacy.LinkTo(externalId);
        return legacy;
    }
}
