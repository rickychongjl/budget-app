using Budget.Domain;

namespace Budget.Application;

// The only repository that is not scoped to the current user: login and the rollover job need to look users up.
public interface IUserRepository
{
    Task<User?> GetAsync(Guid id, CancellationToken ct = default);
    Task<User?> GetByExternalIdAsync(string externalId, CancellationToken ct = default);

    // The one shared demo user; the oldest if a mistake ever made two.
    Task<User?> GetDemoAsync(CancellationToken ct = default);
    Task<IReadOnlyList<User>> ListAsync(CancellationToken ct = default);

    // Non-demo users whose ExternalId is a bare Entra oid rather than "<provider>:<subject>" (LegacyAccountAdoption).
    Task<IReadOnlyList<User>> ListLegacyAsync(CancellationToken ct = default);
    void Add(User user);

    // Deletes every tenant row of this user at once, not through the unit of work; the User row stays.
    // The tenant filter still applies, so it only does anything when the scope is running as that user.
    Task DeleteDataAsync(Guid userId, CancellationToken ct = default);

    // DeleteDataAsync, then the User row, in one database transaction, so a failure leaves the account whole and a retry
    // starts again from the top. A user who is already gone is not an error. Only a scope running as that user may call it.
    Task DeleteAccountAsync(Guid userId, CancellationToken ct = default);
}
