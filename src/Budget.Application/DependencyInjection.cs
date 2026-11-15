using Microsoft.Extensions.DependencyInjection;

namespace Budget.Application;

public static class DependencyInjection
{
    // adoptLegacyUserEmail is the Api's Auth:AdoptLegacyUserEmail (LegacyAccountAdoption). Left out, nothing is adopted.
    public static IServiceCollection AddApplication(this IServiceCollection services, string? adoptLegacyUserEmail = null) => services
        .AddSingleton(TimeProvider.System)
        .AddSingleton(new LegacyAccountSettings(adoptLegacyUserEmail))
        .AddScoped<LegacyAccountAdoption>()
        .AddScoped<UserToday>()
        .AddScoped<CycleFinder>()
        .AddScoped<DemoCaps>()
        .AddScoped<DemoUser>()
        .AddScoped<ResetDemo>()
        .AddScoped<Login>()
        .AddScoped<CycleCategories>()
        .AddScoped<Transactions>()
        .AddScoped<Sync>()
        .AddScoped<Me>()
        .AddScoped<ExportData>()
        .AddScoped<RolloverCycles>()
        .AddScoped<Reports>()
        .AddScoped<Cycles>();
}
