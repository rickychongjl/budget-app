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

    public void Add(User user) => db.Users.Add(user);
}
