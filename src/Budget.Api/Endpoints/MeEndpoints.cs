using Budget.Application;

namespace Budget.Api;

internal static class MeEndpoints
{
    public static void MapMe(this IEndpointRouteBuilder api)
    {
        api.MapGet("/me", (Me me, CancellationToken ct) => me.GetAsync(ct));
        api.MapPatch("/me", (UpdateMeRequest request, Me me, CancellationToken ct) => me.UpdateAsync(request, ct));
    }
}
