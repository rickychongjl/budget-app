using Budget.Domain;
using FluentValidation;

namespace Budget.Application;

public sealed record TransactionDto(
    Guid Id,
    Guid ClientId,
    Guid CycleId,
    Guid CategoryId,
    decimal Amount,
    DateOnly OccurredOn,
    string? Note,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

// RequiresClosingBalanceReview: the write landed in a past cycle, so the UI should prompt for that cycle's closing balance.
// Created is false when a create was a replay of one the server already has.
public sealed record TransactionResult(TransactionDto Transaction, bool RequiresClosingBalanceReview, bool Created = false);

public sealed record TransactionDeleted(bool RequiresClosingBalanceReview);

public sealed class Transactions(
    IUnitOfWork unitOfWork,
    ICategoryRepository categories,
    ITransactionRepository transactions,
    CycleFinder finder,
    DemoCaps demoCaps,
    TimeProvider clock)
{
    public async Task<IReadOnlyList<TransactionDto>> ListAsync(Guid cycleId, Guid? categoryId, CancellationToken ct = default)
    {
        await finder.FindAsync(cycleId, ct);
        return [.. (await transactions.ListForCycleAsync(cycleId, categoryId, ct)).Select(ToDto)];
    }

    // Idempotent on ClientId: offline sync may send the same create more than once.
    public async Task<TransactionResult> CreateAsync(CreateTransactionRequest request, CancellationToken ct = default)
    {
        CreateTransactionValidator.Instance.ValidateAndThrow(request);

        if (await transactions.GetByClientIdAsync(request.ClientId, ct) is { } original)
        {
            return await ResultAsync(original, ct);
        }

        var (cycle, timeline, today) = await finder.FindAsync(request.CycleId, ct);
        timeline.EnsureCanEdit(cycle, CycleEdit.Transactions, today);
        await EnsureInCycleAsync(cycle.Id, request.CategoryId, ct);
        await demoCaps.EnsureCanAddTransactionAsync(ct);
        await demoCaps.EnsureNoteAllowedAsync(request.Note, ct);

        var transaction = new Transaction(cycle, request.CategoryId, request.Amount, request.OccurredOn, Clean(request.Note), request.ClientId, clock.GetUtcNow());
        transactions.Add(transaction);
        try
        {
            await unitOfWork.SaveChangesAsync(ct);
        }
        catch (ConflictException)
        {
            // The same create arrived twice at once and the other request won the unique index on (UserId, ClientId).
            var winner = await transactions.GetByClientIdAsync(request.ClientId, ct) ?? throw new ConflictException("conflict", "The transaction could not be saved.");
            return await ResultAsync(winner, ct);
        }

        return new TransactionResult(ToDto(transaction), timeline.RequiresClosingBalanceReview(cycle, today), Created: true);
    }

    public async Task<TransactionResult> EditAsync(Guid id, EditTransactionRequest request, CancellationToken ct = default)
    {
        EditTransactionValidator.Instance.ValidateAndThrow(request);

        var transaction = await transactions.GetAsync(id, ct) ?? throw NotFound();
        var (cycle, timeline, today) = await finder.FindAsync(transaction.CycleId, ct);
        timeline.EnsureCanEdit(cycle, CycleEdit.Transactions, today);

        await demoCaps.EnsureNoteAllowedAsync(request.Note, ct);

        var categoryId = request.CategoryId ?? transaction.CategoryId;
        if (categoryId != transaction.CategoryId)
        {
            await EnsureInCycleAsync(cycle.Id, categoryId, ct);
        }

        transaction.Edit(
            categoryId,
            request.Amount ?? transaction.Amount,
            request.OccurredOn ?? transaction.OccurredOn,
            request.Note is null ? transaction.Note : Clean(request.Note),
            clock.GetUtcNow());
        await unitOfWork.SaveChangesAsync(ct);
        return new TransactionResult(ToDto(transaction), timeline.RequiresClosingBalanceReview(cycle, today));
    }

    public async Task<TransactionDeleted> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var transaction = await transactions.GetAsync(id, ct) ?? throw NotFound();
        var (cycle, timeline, today) = await finder.FindAsync(transaction.CycleId, ct);
        timeline.EnsureCanEdit(cycle, CycleEdit.Transactions, today);

        transactions.Remove(transaction);
        await unitOfWork.SaveChangesAsync(ct);
        return new TransactionDeleted(timeline.RequiresClosingBalanceReview(cycle, today));
    }

    private async Task<TransactionResult> ResultAsync(Transaction existing, CancellationToken ct)
    {
        var (cycle, timeline, today) = await finder.FindAsync(existing.CycleId, ct);
        return new TransactionResult(ToDto(existing), timeline.RequiresClosingBalanceReview(cycle, today));
    }

    private async Task EnsureInCycleAsync(Guid cycleId, Guid categoryId, CancellationToken ct)
    {
        if (await categories.GetForCycleAsync(cycleId, categoryId, ct) is null)
        {
            throw new NotFoundException("category.not-found", "The category is not in this cycle.");
        }
    }

    private static string? Clean(string? note) => string.IsNullOrWhiteSpace(note) ? null : note.Trim();

    private static NotFoundException NotFound() => new("transaction.not-found", "Transaction not found.");

    private static TransactionDto ToDto(Transaction t) =>
        new(t.Id, t.ClientId, t.CycleId, t.CategoryId, t.Amount, t.OccurredOn, t.Note, t.CreatedAt, t.UpdatedAt);
}
