using Budget.Domain;

namespace Budget.Application;

// Like the demo user, real users are put there by the migrate job: one row per allowlisted oid.
public sealed class RealUsers(IUserRepository users, IUnitOfWork unitOfWork, TimeProvider clock, AllowedOids allowed)
{
    public async Task EnsureExistAsync(CancellationToken ct = default)
    {
        var added = false;
        foreach (var oid in allowed.Values)
        {
            if (await users.GetByExternalIdAsync(oid, ct) is null)
            {
                users.Add(new User("Me", "Australia/Sydney", "AUD", clock.GetUtcNow(), externalId: oid));
                added = true;
            }
        }

        if (added)
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
    }
}
