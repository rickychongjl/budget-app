using FluentValidation;

namespace Budget.Application;

public sealed record CreateCycleRequest(DateOnly StartDate, decimal? OpeningBalance);

// A null field is left as it is. There is no end date: it is always the start date plus 29 days.
public sealed record UpdateCycleRequest(DateOnly? StartDate, decimal? OpeningBalance, decimal? ClosingBalance);

// Validators check the shape of a request. What a cycle allows (phase, overlap, money) is the domain's call.
internal sealed class CreateCycleValidator : AbstractValidator<CreateCycleRequest>
{
    public static readonly CreateCycleValidator Instance = new();

    private CreateCycleValidator() => RuleFor(r => r.StartDate).NotEmpty();
}

internal sealed class UpdateCycleValidator : AbstractValidator<UpdateCycleRequest>
{
    public static readonly UpdateCycleValidator Instance = new();

    private UpdateCycleValidator()
    {
        RuleFor(r => r)
            .Must(r => r.StartDate is not null || r.OpeningBalance is not null || r.ClosingBalance is not null)
            .WithName("request")
            .WithMessage("Give at least one of startDate, openingBalance or closingBalance.");
        RuleFor(r => r.StartDate).NotEqual(default(DateOnly));
    }
}
