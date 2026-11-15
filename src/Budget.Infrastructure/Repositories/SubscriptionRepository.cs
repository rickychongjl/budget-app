using Budget.Application;
using Budget.Domain;
using Microsoft.EntityFrameworkCore;

namespace Budget.Infrastructure;

public sealed class SubscriptionRepository(BudgetDbContext db) : ISubscriptionRepository
{
    public async Task<IReadOnlyList<Subscription>> ListAsync(CancellationToken ct = default) =>
        await db.Subscriptions.OrderByDescending(s => s.CreatedAt).ToListAsync(ct);

    public void Add(Subscription subscription) => db.Subscriptions.Add(subscription);
}
