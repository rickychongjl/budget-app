using Microsoft.Extensions.DependencyInjection;

namespace Budget.Application;

public static class DependencyInjection
{
    // adoptLegacyUserEmail is the Api's Auth:AdoptLegacyUserEmail (LegacyAccountAdoption). Left out, nothing is adopted.
    // complimentaryPremiumEmails is Plans:ComplimentaryPremiumEmails (PlanSettings). Left out, nobody is complimentary.
    public static IServiceCollection AddApplication(
        this IServiceCollection services, string? adoptLegacyUserEmail = null, string? complimentaryPremiumEmails = null) => services
        .AddSingleton(TimeProvider.System)
        .AddSingleton(new LegacyAccountSettings(adoptLegacyUserEmail))
        .AddSingleton(new PlanSettings(complimentaryPremiumEmails))
        .AddScoped<Entitlements>()
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
        .AddScoped<DeleteAccount>()
        .AddScoped<RolloverCycles>()
        .AddScoped<Reports>()
        .AddScoped<Cycles>();
}
