using Budget.Domain;
using FluentValidation;

namespace Budget.Application;

// One queued offline mutation. Type decides which of the optional fields are read:
//   transaction.create  Create
//   transaction.edit    ClientId, Edit
//   transaction.delete  ClientId
//   category.edit       CycleId, CategoryId, Category
// Transactions are named by ClientId, not Id: one created offline has no server id until its create has synced.
public sealed record SyncItem(
    string Type,
    Guid? ClientId = null,
    Guid? CycleId = null,
    Guid? CategoryId = null,
    CreateTransactionRequest? Create = null,
    EditTransactionRequest? Edit = null,
    EditCategoryRequest? Category = null);

public sealed record SyncRequest(IReadOnlyList<SyncItem> Items);

// Result is the same body the matching endpoint returns. Code and Detail are set when the item was refused.
public sealed record SyncItemResult(int Index, bool Ok, object? Result = null, string? Code = null, string? Detail = null);

internal sealed class SyncValidator : AbstractValidator<SyncRequest>
{
    public const int MaxItems = 500;
    public static readonly SyncValidator Instance = new();

    private SyncValidator() => RuleFor(r => r.Items).NotNull().Must(items => items is null || items.Count <= MaxItems)
        .WithMessage($"A batch holds at most {MaxItems} items.");
}

public sealed class Sync(Transactions transactions, CycleCategories categories, ITransactionRepository transactionRepository)
{
    // Each item goes through the same use case as its endpoint and is saved on its own, so one refusal
    // does not undo or block the others. Replaying a batch is safe: creates dedupe on ClientId, edits are
    // last-write-wins and a delete of something already gone counts as done.
    public async Task<IReadOnlyList<SyncItemResult>> ApplyAsync(SyncRequest request, CancellationToken ct = default)
    {
        SyncValidator.Instance.ValidateAndThrow(request);

        var results = new List<SyncItemResult>(request.Items.Count);
        foreach (var (item, index) in request.Items.Select((item, index) => (item, index)))
        {
            try
            {
                results.Add(new SyncItemResult(index, true, await ApplyAsync(item, ct)));
            }
            catch (Exception e) when (Refusal(e) is { } code)
            {
                results.Add(new SyncItemResult(index, false, Code: code, Detail: e.Message));
            }
        }

        return results;
    }

    private async Task<object?> ApplyAsync(SyncItem item, CancellationToken ct) => item switch
    {
        { Type: "transaction.create", Create: { } create } => await transactions.CreateAsync(create, ct),
        { Type: "transaction.edit", ClientId: { } clientId, Edit: { } edit } => await transactions.EditAsync(await IdAsync(clientId, ct) ?? throw Gone(), edit, ct),
        { Type: "transaction.delete", ClientId: { } clientId } => await IdAsync(clientId, ct) is { } id ? await transactions.DeleteAsync(id, ct) : null,
        { Type: "category.edit", CycleId: { } cycleId, CategoryId: { } categoryId, Category: { } edit } => await categories.EditAsync(cycleId, categoryId, edit, ct),
        { Type: "transaction.create" or "transaction.edit" or "transaction.delete" or "category.edit" } =>
            throw new ValidationException($"'{item.Type}' is missing the fields it needs."),
        // A new category has no id for queued transactions to point at, and a removal depends on transactions the server may not have seen yet.
        { Type: "category.add" or "category.remove" } => throw new DomainException("sync.online-only", "Adding or removing a category needs a connection."),
        _ => throw new DomainException("sync.unknown-type", $"'{item.Type}' is not a sync item type."),
    };

    private async Task<Guid?> IdAsync(Guid clientId, CancellationToken ct) => (await transactionRepository.GetByClientIdAsync(clientId, ct))?.Id;

    private static NotFoundException Gone() => new("transaction.not-found", "Transaction not found.");

    // Only the refusals a client can act on are reported per item. Anything else is a server fault and fails the whole request.
    private static string? Refusal(Exception e) => e switch
    {
        ValidationException => "validation",
        NotFoundException x => x.Code,
        DomainException x => x.Code,
        ConflictException x => x.Code,
        _ => null,
    };
}
