using Budget.Domain;

namespace Budget.Application;

// The demo user is an ordinary User row with IsDemo set. The app never creates users at request time,
// so the row is put there by the migrate job; a demo session only ever looks it up.
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
