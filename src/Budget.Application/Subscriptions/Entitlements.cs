using Budget.Domain;

namespace Budget.Application;

// The current user's effective plan, worked out per request from the user row, the settings and their subscriptions.
// Gates live in Application, the way DemoCaps does it: a refusal is a DomainException with a stable code (422), and
// the SPA only draws what GET /api/me says.
public sealed class Entitlements(ICurrentUser currentUser, IUserRepository users, ISubscriptionRepository subscriptions, PlanSettings settings, TimeProvider clock)
{
    public async Task<Entitlement> GetAsync(CancellationToken ct = default)
    {
        var user = await users.GetAsync(currentUser.Id, ct) ?? throw new NotFoundException("user.not-found", "User not found.");
        return await ForAsync(user, ct);
    }

    // For a caller that already has the user row. Subscriptions are only read when nothing else grants Premium.
    public async Task<Entitlement> ForAsync(User user, CancellationToken ct = default)
    {
        var complimentary = settings.IsComplimentary(user.Email);
        IReadOnlyList<Subscription> rows = user.IsDemo || complimentary ? [] : await subscriptions.ListAsync(ct);
        return Entitlement.Resolve(user, complimentary, rows, clock.GetUtcNow());
    }
}
