using Budget.Domain;

namespace Budget.Application;

// Maps a validated provider token to a User, creating one on first sign-in. The provider has authenticated the person;
// this decides which row they are. The session that follows carries only the returned id.
public sealed class Login(IUserRepository users, IUnitOfWork unitOfWork, TimeProvider clock, LegacyAccountAdoption adoption)
{
    private const int DisplayNameMaxLength = 100;
    private const int EmailMaxLength = 254;

    public async Task<Guid> ResolveAsync(ExternalSignIn signIn, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(signIn.Subject)
            || ExternalIdentity.Qualify(signIn.Provider, signIn.Subject) is not { Length: <= ExternalIdentity.MaxLength } externalId)
        {
            throw new ForbiddenException("auth.failed", "The sign-in did not identify an account.");
        }

        // An address the provider has not checked could be anyone's: not enough to hold an account, and never enough to adopt one.
        if (!signIn.EmailVerified || string.IsNullOrWhiteSpace(signIn.Email))
        {
            throw new ForbiddenException("auth.email-unverified", "The account's email address is not verified.");
        }

        var email = signIn.Email.Trim() is { Length: <= EmailMaxLength } kept ? kept : null;

        if (await users.GetByExternalIdAsync(externalId, ct) is { } known)
        {
            if (known.Email != email)
            {
                known.ChangeEmail(email);
                await unitOfWork.SaveChangesAsync(ct);
            }

            return known.Id;
        }

        var user = await adoption.TryAdoptAsync(externalId, signIn.Email, ct);
        if (user is null)
        {
            user = new User(DisplayName(signIn.Name), "Australia/Sydney", "AUD", clock.GetUtcNow(), externalId, email: email);
            users.Add(user);
        }
        else
        {
            user.ChangeEmail(email);
        }

        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (ConflictException)
        {
            // Two first sign-ins at once: the other request won the unique index on ExternalId. Its row is this person's.
            return (await users.GetByExternalIdAsync(externalId, ct))?.Id
                ?? throw new ConflictException("conflict", "The account could not be created.");
        }

        return user.Id;
    }

    // The token's name, if it has one, until the user changes it. The time zone is set by the first run (L2).
    private static string DisplayName(string? name) =>
        name?.Trim() is { Length: > 0 } trimmed ? trimmed[..Math.Min(trimmed.Length, DisplayNameMaxLength)] : "Me";
}
