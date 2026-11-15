using Budget.Domain;

namespace Budget.Application;

// The demo user is an ordinary User row with IsDemo set. It is put there by the migrate job, not by a request:
// a demo session only ever looks it up. (Real users are created by their first sign-in, in Login.)
public sealed class DemoUser(IUserRepository users, IUnitOfWork unitOfWork, TimeProvider clock)
{
    public async Task EnsureExistsAsync(CancellationToken ct = default)
    {
        if (await users.GetDemoAsync(ct) is not null)
        {
            return;
        }

        users.Add(new User("Demo", "Australia/Sydney", "AUD", clock.GetUtcNow(), isDemo: true));
        await unitOfWork.SaveChangesAsync(ct);
    }

    public async Task<Guid> GetIdAsync(CancellationToken ct = default) =>
        (await users.GetDemoAsync(ct))?.Id ?? throw new NotFoundException("demo.unavailable", "The demo is not available.");
}
