using Budget.Application;
using Budget.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Budget.Jobs;

// What the entry points in Program.cs share. Public so the per-user loop can be tested against a real database.
public static class JobHost
{
    public static ServiceProvider BuildServices(string connectionString, IEnumerable<string>? allowedOids) => new ServiceCollection()
        .AddApplication(allowedOids)
        .AddInfrastructure(connectionString)
        .AddScoped<JobUser>()
        .AddScoped<ICurrentUser>(p => p.GetRequiredService<JobUser>())
        .BuildServiceProvider();

    // A cross-user job keeps the tenant filter on: list the users, then do each one's work in its own scope, as that user.
    // One user failing does not stop the rest; the exit code says whether any did, and the output never names anyone.
    public static async Task<int> RolloverAsync(IServiceProvider services, CancellationToken ct = default)
    {
        IReadOnlyList<Guid> userIds;
        await using (var scope = services.CreateAsyncScope())
        {
            userIds = [.. (await scope.ServiceProvider.GetRequiredService<IUserRepository>().ListAsync(ct)).Select(u => u.Id)];
        }

        var (created, failed) = (0, 0);
        foreach (var userId in userIds)
        {
            await using var scope = services.CreateAsyncScope();
            scope.ServiceProvider.GetRequiredService<JobUser>().Id = userId;
            try
            {
                created += await scope.ServiceProvider.GetRequiredService<RolloverCycles>().RunAsync(ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                failed++;
                Console.Error.WriteLine($"Rollover failed for a user: {e.GetType().Name}");
            }
        }

        Console.WriteLine($"Rollover: {userIds.Count} users, {created} cycles created, {failed} failed.");
        return failed == 0 ? 0 : 1;
    }
}

// Who the current scope is working as. Nobody by default: the tenant filter then hides everything and the write guard
// refuses everything, which is right for migrate, which touches no tenant rows.
public sealed class JobUser : ICurrentUser
{
    public Guid Id { get; set; }
}
