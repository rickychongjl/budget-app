namespace Budget.Application;

// Maps a validated Entra token's oid to a User. Two locks, both required: the allowlist and an existing row.
// Login never creates a user, and every refusal has the same reason so the answer gives nothing away.
public sealed class Login(IUserRepository users, AllowedOids allowed)
{
    public async Task<Guid> ResolveAsync(string? oid, CancellationToken ct = default)
    {
        if (!string.IsNullOrWhiteSpace(oid)
            && AllowedOids.Normalise(oid) is var known
            && allowed.Values.Contains(known)
            && await users.GetByExternalIdAsync(known, ct) is { } user)
        {
            return user.Id;
        }

        throw new ForbiddenException("auth.not-allowed", "This account is not allowed to sign in.");
    }
}
