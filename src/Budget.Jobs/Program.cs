using Budget.Application;
using Budget.Infrastructure;
using Budget.Jobs;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

// One console host, one entry point per job. Each stays thin: the work is an Application use case.
// Settings come from the same variables the API reads.
var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__Budget");
if (string.IsNullOrWhiteSpace(connectionString))
{
    Console.Error.WriteLine("ConnectionStrings__Budget is not set.");
    return 2;
}

await using var services = JobHost.BuildServices(connectionString, Environment.GetEnvironmentVariable("Auth__AllowedOids")?.Split(','));

switch (args)
{
    case ["migrate"]:
        await using (var scope = services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<BudgetDbContext>().Database.MigrateAsync();
            // The app never creates users, so the rows a session signs in as have to exist before the API starts:
            // the demo user, and one per allowlisted Entra oid.
            await scope.ServiceProvider.GetRequiredService<DemoUser>().EnsureExistsAsync();
            await scope.ServiceProvider.GetRequiredService<RealUsers>().EnsureExistAsync();
        }

        Console.WriteLine("Migrations applied; users present.");
        // A first deploy should not show an empty demo until the nightly reset.
        return await JobHost.ResetDemoAsync(services, onlyIfEmpty: true);

    case ["rollover"]:
        return await JobHost.RolloverAsync(services);

    case ["reset-demo"]:
        return await JobHost.ResetDemoAsync(services);

    default:
        Console.Error.WriteLine("Usage: Budget.Jobs migrate|rollover|reset-demo");
        return 2;
}
