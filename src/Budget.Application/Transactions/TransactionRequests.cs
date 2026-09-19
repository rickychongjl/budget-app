using FluentValidation;

namespace Budget.Application;

// ClientId is made up by the client, once per transaction, and is what makes a replayed create harmless.
// CycleId is the cycle the user was looking at: a transaction is never bucketed by OccurredOn.
public sealed record CreateTransactionRequest(Guid ClientId, Guid CycleId, Guid CategoryId, decimal Amount, DateOnly OccurredOn, string? Note);

// A null field is left as it is; an empty Note clears it. The cycle cannot change.
public sealed record EditTransactionRequest(Guid? CategoryId, decimal? Amount, DateOnly? OccurredOn, string? Note);

internal sealed class CreateTransactionValidator : AbstractValidator<CreateTransactionRequest>
{
    public static readonly CreateTransactionValidator Instance = new();

    private CreateTransactionValidator()
    {
        RuleFor(r => r.ClientId).NotEmpty();
        RuleFor(r => r.CycleId).NotEmpty();
        RuleFor(r => r.CategoryId).NotEmpty();
        RuleFor(r => r.OccurredOn).NotEmpty();
        RuleFor(r => r.Note).MaximumLength(280);
    }
}

internal sealed class EditTransactionValidator : AbstractValidator<EditTransactionRequest>
{
    public static readonly EditTransactionValidator Instance = new();

    private EditTransactionValidator()
    {
        RuleFor(r => r)
            .Must(r => r.CategoryId is not null || r.Amount is not null || r.OccurredOn is not null || r.Note is not null)
            .WithName("request")
            .WithMessage("Give at least one field to change.");
        RuleFor(r => r.CategoryId).NotEqual(Guid.Empty);
        RuleFor(r => r.OccurredOn).NotEqual(default(DateOnly));
        RuleFor(r => r.Note).MaximumLength(280);
    }
}
