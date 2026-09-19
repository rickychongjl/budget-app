using Budget.Application;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Budget.Infrastructure;

public static class DependencyInjection
{
    // The host supplies ICurrentUser: the session for a request, the user being processed for a job scope.
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, string? connectionString) => services
        .AddDbContext<BudgetDbContext>(o => o.UseSqlServer(connectionString))
        .AddScoped<IUnitOfWork>(p => p.GetRequiredService<BudgetDbContext>())
        .AddScoped<IUserRepository, UserRepository>()
        .AddScoped<ICycleRepository, CycleRepository>()
        .AddScoped<ICategoryRepository, CategoryRepository>()
        .AddScoped<ITransactionRepository, TransactionRepository>();
}
