using Budget.Domain;

namespace Budget.Application;

public sealed record MeDto(Guid Id, string DisplayName, string TimeZone, string Currency, bool IsDemo, int CycleLengthDays);

public sealed class Me(ICurrentUser currentUser, IUserRepository users)
{
    public async Task<MeDto> GetAsync(CancellationToken ct = default)
    {
        var user = await users.GetAsync(currentUser.Id, ct) ?? throw new NotFoundException("user.not-found", "User not found.");
        return new MeDto(user.Id, user.DisplayName, user.TimeZone, user.Currency, user.IsDemo, Cycle.LengthInDays);
    }
}
