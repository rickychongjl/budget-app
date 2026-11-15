using Budget.Application;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Budget.Infrastructure;

public static class DependencyInjection
{
    // The host supplies ICurrentUser: the session for a request, the user being processed for a job scope.
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, string? connectionString) => services
        // Azure SQL drops connections now and then (failover, throttling); the retry covers those. Safe because each
        // SaveChanges is one unit the strategy can replay whole, and the one explicit transaction
        // (UserRepository.DeleteAccountAsync) runs inside the strategy so it is replayed whole too.
        .AddDbContext<BudgetDbContext>(o => o.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure()))
        .AddScoped<IUnitOfWork>(p => p.GetRequiredService<BudgetDbContext>())
        // Until a store integration replaces it (L6 to L8), there is nothing to cancel when an account is deleted.
        .AddScoped<IBilling, NoBilling>()
        .AddScoped<IUserRepository, UserRepository>()
        .AddScoped<ICycleRepository, CycleRepository>()
        .AddScoped<ICategoryRepository, CategoryRepository>()
        .AddScoped<ITransactionRepository, TransactionRepository>();
}
