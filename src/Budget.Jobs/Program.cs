using Budget.Application;
using Budget.Infrastructure;
using Budget.Jobs;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

// One console host, one entry point per job: `migrate` and `rollover` here; `reset-demo` arrives with the demo fixture.
// Each entry point stays thin. Settings come from the same variables the API reads.
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
        return 0;

    case ["rollover"]:
        return await JobHost.RolloverAsync(services);

    default:
        Console.Error.WriteLine("Usage: Budget.Jobs migrate|rollover");
        return 2;
}
