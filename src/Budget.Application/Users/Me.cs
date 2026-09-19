using Budget.Domain;
using FluentValidation;

namespace Budget.Application;

public sealed record MeDto(Guid Id, string DisplayName, string TimeZone, string Currency, bool IsDemo, int CycleLengthDays);

// A null field is left as it is.
public sealed record UpdateMeRequest(string? DisplayName, string? TimeZone);

internal sealed class UpdateMeValidator : AbstractValidator<UpdateMeRequest>
{
    public static readonly UpdateMeValidator Instance = new();

    private UpdateMeValidator()
    {
        RuleFor(r => r)
            .Must(r => r.DisplayName is not null || r.TimeZone is not null)
            .WithName("request")
            .WithMessage("Give at least one of displayName or timeZone.");
        RuleFor(r => r.DisplayName).NotEmpty().MaximumLength(100).When(r => r.DisplayName is not null);
        RuleFor(r => r.TimeZone).NotEmpty().MaximumLength(64).When(r => r.TimeZone is not null);
    }
}

public sealed class Me(ICurrentUser currentUser, IUserRepository users, IUnitOfWork unitOfWork)
{
    public async Task<MeDto> GetAsync(CancellationToken ct = default) => ToDto(await FindAsync(ct));

    public async Task<MeDto> UpdateAsync(UpdateMeRequest request, CancellationToken ct = default)
    {
        UpdateMeValidator.Instance.ValidateAndThrow(request);

        var user = await FindAsync(ct);
        if (user.IsDemo)
        {
            // Every visitor shares this row, so one of them must not be able to rename it for the rest.
            throw new DomainException("demo.profile.readonly", "The demo profile cannot be changed.");
        }

        if (request.DisplayName is { } displayName)
        {
            user.Rename(displayName.Trim());
        }

        if (request.TimeZone is { } timeZone)
        {
            user.ChangeTimeZone(timeZone);
        }

        await unitOfWork.SaveChangesAsync(ct);
        return ToDto(user);
    }

    private async Task<User> FindAsync(CancellationToken ct) =>
        await users.GetAsync(currentUser.Id, ct) ?? throw new NotFoundException("user.not-found", "User not found.");

    private static MeDto ToDto(User user) => new(user.Id, user.DisplayName, user.TimeZone, user.Currency, user.IsDemo, Cycle.LengthInDays);
}
