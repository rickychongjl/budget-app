namespace Budget.Application;

// Every cycle rule depends on "today", and today is the current user's local date, never the server's.
public sealed class UserToday(ICurrentUser currentUser, IUserRepository users, TimeProvider clock)
{
    public async Task<DateOnly> GetAsync(CancellationToken ct = default)
    {
        var user = await users.GetAsync(currentUser.Id, ct) ?? throw new NotFoundException("user.not-found", "User not found.");
        return user.Today(clock);
    }
}
