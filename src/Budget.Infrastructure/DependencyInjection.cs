using Budget.Application;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Budget.Infrastructure;

public static class DependencyInjection
{
    // The host supplies ICurrentUser: the session for a request, the user being processed for a job scope.
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, string? connectionString) => services
        // Azure SQL drops connections now and then (failover, throttling); the retry covers those. Safe because nothing
        // opens its own transaction: each SaveChanges is one unit the strategy can replay whole.
        .AddDbContext<BudgetDbContext>(o => o.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure()))
        .AddScoped<IUnitOfWork>(p => p.GetRequiredService<BudgetDbContext>())
        .AddScoped<IUserRepository, UserRepository>()
        .AddScoped<ICycleRepository, CycleRepository>()
        .AddScoped<ICategoryRepository, CategoryRepository>()
        .AddScoped<ITransactionRepository, TransactionRepository>();
}
