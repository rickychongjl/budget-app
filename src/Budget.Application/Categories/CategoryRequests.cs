using Budget.Domain;
using FluentValidation;

namespace Budget.Application;

// CategoryId puts an existing category into this cycle; without it, Type is required and a new category is created.
public sealed record AddCategoryRequest(Guid? CategoryId, CategoryType? Type, string Name, string Icon, string Colour, int SortOrder, decimal BudgetAmount);

// A null field is left as it is. Type is not here: it is fixed for the life of the category.
public sealed record EditCategoryRequest(string? Name, string? Icon, string? Colour, int? SortOrder, decimal? BudgetAmount);

// Lengths match the columns, so the user gets a field error instead of a database one.
internal sealed class AddCategoryValidator : AbstractValidator<AddCategoryRequest>
{
    public static readonly AddCategoryValidator Instance = new();

    private AddCategoryValidator()
    {
        RuleFor(r => r.Type).NotNull().IsInEnum().When(r => r.CategoryId is null);
        RuleFor(r => r.Name).NotEmpty().MaximumLength(60);
        RuleFor(r => r.Icon).NotEmpty().MaximumLength(40);
        RuleFor(r => r.Colour).NotEmpty().MaximumLength(20);
        RuleFor(r => r.SortOrder).GreaterThanOrEqualTo(0);
    }
}

internal sealed class EditCategoryValidator : AbstractValidator<EditCategoryRequest>
{
    public static readonly EditCategoryValidator Instance = new();

    private EditCategoryValidator()
    {
        RuleFor(r => r)
            .Must(r => r.Name is not null || r.Icon is not null || r.Colour is not null || r.SortOrder is not null || r.BudgetAmount is not null)
            .WithName("request")
            .WithMessage("Give at least one field to change.");
        RuleFor(r => r.Name).NotEmpty().MaximumLength(60).When(r => r.Name is not null);
        RuleFor(r => r.Icon).NotEmpty().MaximumLength(40).When(r => r.Icon is not null);
        RuleFor(r => r.Colour).NotEmpty().MaximumLength(20).When(r => r.Colour is not null);
        RuleFor(r => r.SortOrder).GreaterThanOrEqualTo(0).When(r => r.SortOrder is not null);
    }
}
