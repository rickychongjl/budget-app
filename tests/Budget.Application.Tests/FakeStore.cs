using Budget.Domain;

namespace Budget.Application.Tests;

// Every repository, the unit of work and the current user over plain lists. Tenant rows are filtered by the
// current user like the real DbContext, so a use case that forgets whose data it is fails here too.
internal sealed class FakeStore : ICurrentUser, IUnitOfWork, IUserRepository, ICycleRepository, ICategoryRepository, ITransactionRepository
{
    public List<User> Users { get; } = [];
    public List<Cycle> Cycles { get; } = [];
    public List<Category> Categories { get; } = [];
    public List<CycleCategory> CycleCategories { get; } = [];
    public List<Transaction> Transactions { get; } = [];

    public Guid Id { get; set; }
    public int Saves { get; private set; }
    public Exception? FailNextSave { get; set; }

    public User SignIn(string timeZone = "Australia/Sydney", bool isDemo = false)
    {
        var user = new User("Test", timeZone, "AUD", DateTimeOffset.UnixEpoch, isDemo: isDemo);
        Users.Add(user);
        Id = user.Id;
        return user;
    }

    public Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        if (FailNextSave is { } failure)
        {
            FailNextSave = null;
            throw failure;
        }

        Saves++;
        return Task.FromResult(0);
    }

    Task<User?> IUserRepository.GetAsync(Guid id, CancellationToken ct) => Task.FromResult(Users.SingleOrDefault(u => u.Id == id));
    Task<User?> IUserRepository.GetByExternalIdAsync(string externalId, CancellationToken ct) => Task.FromResult(Users.SingleOrDefault(u => u.ExternalId == externalId));
    Task<User?> IUserRepository.GetDemoAsync(CancellationToken ct) => Task.FromResult(Users.Where(u => u.IsDemo).OrderBy(u => u.CreatedAt).FirstOrDefault());
    Task<IReadOnlyList<User>> IUserRepository.ListAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<User>>(Users);
    public void Add(User user) => Users.Add(user);

    // Like the real one, it is filtered by the current user as well as by the id it is given.
    Task IUserRepository.DeleteDataAsync(Guid userId, CancellationToken ct)
    {
        Transactions.RemoveAll(t => t.UserId == userId && t.UserId == Id);
        CycleCategories.RemoveAll(c => c.UserId == userId && c.UserId == Id);
        Cycles.RemoveAll(c => c.UserId == userId && c.UserId == Id);
        Categories.RemoveAll(c => c.UserId == userId && c.UserId == Id);
        return Task.CompletedTask;
    }

    Task<IReadOnlyList<Cycle>> ICycleRepository.ListAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<Cycle>>([.. Cycles.Where(c => c.UserId == Id).OrderBy(c => c.StartDate)]);
    Task<Cycle?> ICycleRepository.GetAsync(Guid id, CancellationToken ct) => Task.FromResult(Cycles.SingleOrDefault(c => c.UserId == Id && c.Id == id));
    public void Add(Cycle cycle) => Cycles.Add(cycle);

    Task<IReadOnlyList<Category>> ICategoryRepository.ListAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<Category>>([.. Categories.Where(c => c.UserId == Id)]);
    Task<Category?> ICategoryRepository.GetAsync(Guid id, CancellationToken ct) => Task.FromResult(Categories.SingleOrDefault(c => c.UserId == Id && c.Id == id));
    public void Add(Category category) => Categories.Add(category);

    Task<IReadOnlyList<CycleCategory>> ICategoryRepository.ListForCycleAsync(Guid cycleId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<CycleCategory>>([.. CycleCategories.Where(c => c.UserId == Id && c.CycleId == cycleId).OrderBy(c => c.SortOrder)]);
    Task<IReadOnlyList<CycleCategory>> ICategoryRepository.ListForAllCyclesAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<CycleCategory>>([.. CycleCategories.Where(c => c.UserId == Id).OrderBy(c => c.SortOrder)]);
    Task<CycleCategory?> ICategoryRepository.GetForCycleAsync(Guid cycleId, Guid categoryId, CancellationToken ct) =>
        Task.FromResult(CycleCategories.SingleOrDefault(c => c.UserId == Id && c.CycleId == cycleId && c.CategoryId == categoryId));
    public void Add(CycleCategory cycleCategory) => CycleCategories.Add(cycleCategory);
    public void Remove(CycleCategory cycleCategory) => CycleCategories.Remove(cycleCategory);

    Task<IReadOnlyList<Transaction>> ITransactionRepository.ListForCycleAsync(Guid cycleId, Guid? categoryId, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<Transaction>>([.. Transactions
            .Where(t => t.UserId == Id && t.CycleId == cycleId && (categoryId is null || t.CategoryId == categoryId))
            .OrderByDescending(t => t.OccurredOn).ThenByDescending(t => t.CreatedAt)]);
    Task<IReadOnlyList<CategoryTotal>> ITransactionRepository.SumByCategoryAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<CategoryTotal>>([.. Transactions
            .Where(t => t.UserId == Id)
            .GroupBy(t => (t.CycleId, t.CategoryId))
            .Select(g => new CategoryTotal(g.Key.CycleId, g.Key.CategoryId, g.Sum(t => t.Amount)))]);
    Task<Transaction?> ITransactionRepository.GetAsync(Guid id, CancellationToken ct) => Task.FromResult(Transactions.SingleOrDefault(t => t.UserId == Id && t.Id == id));
    Task<Transaction?> ITransactionRepository.GetByClientIdAsync(Guid clientId, CancellationToken ct) =>
        Task.FromResult(Transactions.SingleOrDefault(t => t.UserId == Id && t.ClientId == clientId));
    Task<int> ITransactionRepository.CountAsync(CancellationToken ct) => Task.FromResult(Transactions.Count(t => t.UserId == Id));
    Task<bool> ITransactionRepository.AnyForCategoryAsync(Guid cycleId, Guid categoryId, CancellationToken ct) =>
        Task.FromResult(Transactions.Any(t => t.UserId == Id && t.CycleId == cycleId && t.CategoryId == categoryId));
    public void Add(Transaction transaction) => Transactions.Add(transaction);
    public void Remove(Transaction transaction) => Transactions.Remove(transaction);
}

internal sealed class FixedClock(DateTimeOffset utcNow) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => utcNow;
}
