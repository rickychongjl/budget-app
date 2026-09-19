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
    }
}
