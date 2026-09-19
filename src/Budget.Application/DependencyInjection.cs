using Microsoft.Extensions.DependencyInjection;

namespace Budget.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services) => services
        .AddSingleton(TimeProvider.System)
        .AddScoped<UserToday>()
        .AddScoped<CycleFinder>()
        .AddScoped<CycleCategories>()
        .AddScoped<Transactions>()
        .AddScoped<Me>()
        .AddScoped<RolloverCycles>()
        .AddScoped<Cycles>();
}
