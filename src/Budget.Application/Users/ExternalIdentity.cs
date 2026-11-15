namespace Budget.Application;

// User.ExternalId is "<provider>:<subject>", so the same subject from two providers is two accounts and a later provider
// (Apple) is one more prefix. A value without the separator is an Entra oid from before Google sign-in (LegacyAccountAdoption).
public static class ExternalIdentity
{
    public const string Separator = ":";

    // The column's length. Google allows a subject of up to 255 characters, plus the prefix.
    public const int MaxLength = 300;

    public static string Qualify(string provider, string subject) => provider + Separator + subject;

    public static bool IsQualified(string externalId) => externalId.Contains(Separator, StringComparison.Ordinal);
}

// What a validated provider token says about the person, mapped by the Api's sign-in handler. Nothing here is trusted
// beyond what the provider vouches for: EmailVerified is the provider's own email_verified claim.
public sealed record ExternalSignIn(string Provider, string? Subject, string? Email, bool EmailVerified, string? Name);
