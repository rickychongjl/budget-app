using Budget.Application;

namespace Budget.Api;

internal static class CycleEndpoints
{
    public static void MapCycles(this IEndpointRouteBuilder api)
    {
        var cycles = api.MapGroup("/cycles");

        cycles.MapGet("/", (Cycles useCase, CancellationToken ct) => useCase.ListAsync(ct));
        cycles.MapGet("/current", (Cycles useCase, CancellationToken ct) => useCase.GetCurrentAsync(ct));
        cycles.MapGet("/{id:guid}", (Guid id, Cycles useCase, CancellationToken ct) => useCase.GetAsync(id, ct));

        cycles.MapPost("/", async (CreateCycleRequest request, Cycles useCase, CancellationToken ct) =>
        {
            var cycle = await useCase.CreateFirstAsync(request, ct);
            return Results.Created($"/api/cycles/{cycle.Id}", cycle);
        });
        cycles.MapPost("/{id:guid}/confirm", (Guid id, Cycles useCase, CancellationToken ct) => useCase.ConfirmAsync(id, ct));
        cycles.MapPatch("/{id:guid}", (Guid id, UpdateCycleRequest request, Cycles useCase, CancellationToken ct) => useCase.UpdateAsync(id, request, ct));
    }
}
