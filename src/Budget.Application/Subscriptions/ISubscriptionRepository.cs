using Budget.Domain;

namespace Budget.Application;

public interface ISubscriptionRepository
{
    // The current user's subscriptions, lapsed ones included.
    Task<IReadOnlyList<Subscription>> ListAsync(CancellationToken ct = default);
    void Add(Subscription subscription);
}
