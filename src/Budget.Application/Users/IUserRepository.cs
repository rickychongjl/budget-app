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
}
