using Budget.Application;
using Budget.Domain;
using Microsoft.EntityFrameworkCore;

namespace Budget.Infrastructure;

public sealed class UserRepository(BudgetDbContext db) : IUserRepository
{
    public Task<User?> GetAsync(Guid id, CancellationToken ct = default) =>
        db.Users.SingleOrDefaultAsync(u => u.Id == id, ct);

    public Task<User?> GetByExternalIdAsync(string externalId, CancellationToken ct = default) =>
        db.Users.SingleOrDefaultAsync(u => u.ExternalId == externalId, ct);

    public Task<User?> GetDemoAsync(CancellationToken ct = default) =>
        db.Users.Where(u => u.IsDemo).OrderBy(u => u.CreatedAt).FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<User>> ListAsync(CancellationToken ct = default) =>
        await db.Users.OrderBy(u => u.CreatedAt).ToListAsync(ct);

    // ExternalIdentity.IsQualified as SQL (LIKE '%:%'); the demo row and rows with no external id are never legacy.
    public async Task<IReadOnlyList<User>> ListLegacyAsync(CancellationToken ct = default) =>
        await db.Users
            .Where(u => !u.IsDemo && u.ExternalId != null && !u.ExternalId.Contains(ExternalIdentity.Separator))
            .OrderBy(u => u.CreatedAt)
            .ToListAsync(ct);

    public void Add(User user) => db.Users.Add(user);

    // Children first: every foreign key is Restrict. The explicit UserId is on top of the query filter, not instead of it.
    public async Task DeleteDataAsync(Guid userId, CancellationToken ct = default)
    {
        await db.Transactions.Where(t => t.UserId == userId).ExecuteDeleteAsync(ct);
        await db.CycleCategories.Where(c => c.UserId == userId).ExecuteDeleteAsync(ct);
        await db.Cycles.Where(c => c.UserId == userId).ExecuteDeleteAsync(ct);
        await db.Categories.Where(c => c.UserId == userId).ExecuteDeleteAsync(ct);
        await db.Subscriptions.Where(s => s.UserId == userId).ExecuteDeleteAsync(ct);
    }

    // The User row has no query filter, so this checks what the filter would: as anyone else, DeleteDataAsync deletes
    // nothing and the User delete would then remove a stranger's empty account (or fail on their rows' foreign keys).
    // Inside the execution strategy because the connection retries on Azure SQL's transient faults: a retry replays the
    // whole transaction, which is safe because every statement is a delete.
    public async Task DeleteAccountAsync(Guid userId, CancellationToken ct = default)
    {
        if (userId == Guid.Empty || userId != db.CurrentUserId)
        {
            throw new InvalidOperationException("An account can only be deleted by a scope running as that user.");
        }

        await db.Database.CreateExecutionStrategy().ExecuteAsync(async token =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(token);
            await DeleteDataAsync(userId, token);
            await db.Users.Where(u => u.Id == userId).ExecuteDeleteAsync(token);
            await transaction.CommitAsync(token);
        }, ct);
    }
}
