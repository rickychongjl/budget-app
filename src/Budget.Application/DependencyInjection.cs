using Microsoft.Extensions.DependencyInjection;

namespace Budget.Application;

public static class DependencyInjection
{
    // allowedOids comes from each host's configuration (Auth:AllowedOids). Left out, nobody can sign in with Entra.
    public static IServiceCollection AddApplication(this IServiceCollection services, IEnumerable<string>? allowedOids = null) => services
        .AddSingleton(TimeProvider.System)
        .AddSingleton(new AllowedOids(allowedOids ?? []))
        .AddScoped<UserToday>()
        .AddScoped<CycleFinder>()
        .AddScoped<DemoCaps>()
        .AddScoped<DemoUser>()
        .AddScoped<RealUsers>()
        .AddScoped<ResetDemo>()
        .AddScoped<Login>()
        .AddScoped<CycleCategories>()
        .AddScoped<Transactions>()
        .AddScoped<Sync>()
        .AddScoped<Me>()
        .AddScoped<RolloverCycles>()
        .AddScoped<Cycles>();
}
