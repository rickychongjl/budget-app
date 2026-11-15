using Budget.Application;

namespace Budget.Api;

internal static class PlanEndpoints
{
    public static void MapPlans(this IEndpointRouteBuilder api) =>
        // Signed out too: the public pricing page prints these. The same for everyone, and it reads no data.
        api.MapGet("/plans", () => PlanCatalogueDto.Current).AllowAnonymous();
}
