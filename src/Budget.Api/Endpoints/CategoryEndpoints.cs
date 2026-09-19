using Budget.Application;

namespace Budget.Api;

internal static class CategoryEndpoints
{
    public static void MapCategories(this IEndpointRouteBuilder api)
    {
        api.MapGet("/categories", (CycleCategories useCase, CancellationToken ct) => useCase.ListIdentitiesAsync(ct));

        var inCycle = api.MapGroup("/cycles/{cycleId:guid}/categories");

        inCycle.MapPost("/", async (Guid cycleId, AddCategoryRequest request, CycleCategories useCase, CancellationToken ct) =>
        {
            var category = await useCase.AddAsync(cycleId, request, ct);
            return Results.Created($"/api/cycles/{cycleId}", category);
        });
        inCycle.MapPatch("/{categoryId:guid}", (Guid cycleId, Guid categoryId, EditCategoryRequest request, CycleCategories useCase, CancellationToken ct) =>
            useCase.EditAsync(cycleId, categoryId, request, ct));
        inCycle.MapDelete("/{categoryId:guid}", async (Guid cycleId, Guid categoryId, CycleCategories useCase, CancellationToken ct) =>
        {
            await useCase.RemoveAsync(cycleId, categoryId, ct);
            return Results.NoContent();
        });
    }
}
