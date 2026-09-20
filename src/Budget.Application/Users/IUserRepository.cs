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
    void Add(User user);

    // Deletes every tenant row of this user at once, not through the unit of work; the User row stays.
    // The tenant filter still applies, so it only does anything when the scope is running as that user.
    Task DeleteDataAsync(Guid userId, CancellationToken ct = default);
}
