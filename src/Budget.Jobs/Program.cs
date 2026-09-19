using Budget.Application;
using Budget.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

// One console host, one entry point per job: `migrate` here; `rollover` and `reset-demo` arrive with their milestones.
// Each entry point stays thin. The connection string comes from the same variable the API reads.
var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__Budget");
if (string.IsNullOrWhiteSpace(connectionString))
{
    Console.Error.WriteLine("ConnectionStrings__Budget is not set.");
    return 2;
}

await using var services = new ServiceCollection()
    .AddApplication(Environment.GetEnvironmentVariable("Auth__AllowedOids")?.Split(','))
    .AddInfrastructure(connectionString)
    .AddScoped<ICurrentUser, Nobody>()
    .BuildServiceProvider();
await using var scope = services.CreateAsyncScope();

switch (args)
{
    case ["migrate"]:
        await scope.ServiceProvider.GetRequiredService<BudgetDbContext>().Database.MigrateAsync();
        // The app never creates users, so the rows a session signs in as have to exist before the API starts:
        // the demo user, and one per allowlisted Entra oid.
        await scope.ServiceProvider.GetRequiredService<DemoUser>().EnsureExistsAsync();
        await scope.ServiceProvider.GetRequiredService<RealUsers>().EnsureExistAsync();
        Console.WriteLine("Migrations applied; users present.");
        return 0;

    default:
        Console.Error.WriteLine("Usage: Budget.Jobs migrate");
        return 2;
}

// Migrating touches no tenant rows, so it runs as nobody: the tenant filter hides everything and the write guard refuses everything.
internal sealed class Nobody : ICurrentUser
{
    public Guid Id => Guid.Empty;
}
