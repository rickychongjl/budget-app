using Microsoft.Extensions.DependencyInjection;

namespace Budget.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services) => services
        .AddSingleton(TimeProvider.System)
        .AddScoped<Me>()
        .AddScoped<RolloverCycles>();
}
