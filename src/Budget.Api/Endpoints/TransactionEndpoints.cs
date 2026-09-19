using Budget.Application;

namespace Budget.Api;

internal static class TransactionEndpoints
{
    public static void MapTransactions(this IEndpointRouteBuilder api)
    {
        var transactions = api.MapGroup("/transactions");

        transactions.MapGet("/", (Guid cycleId, Guid? categoryId, Transactions useCase, CancellationToken ct) => useCase.ListAsync(cycleId, categoryId, ct));

        // 201 for a new transaction, 200 for a replay of one the server already has.
        transactions.MapPost("/", async (CreateTransactionRequest request, Transactions useCase, CancellationToken ct) =>
        {
            var result = await useCase.CreateAsync(request, ct);
            return result.Created ? Results.Created($"/api/transactions/{result.Transaction.Id}", result) : Results.Ok(result);
        });
        transactions.MapPatch("/{id:guid}", (Guid id, EditTransactionRequest request, Transactions useCase, CancellationToken ct) => useCase.EditAsync(id, request, ct));
        transactions.MapDelete("/{id:guid}", (Guid id, Transactions useCase, CancellationToken ct) => useCase.DeleteAsync(id, ct));
    }
}
