using Budget.Application;

namespace Budget.Api;

internal static class ReportEndpoints
{
    public static void MapReports(this IEndpointRouteBuilder api)
    {
        var reports = api.MapGroup("/reports");

        reports.MapGet("/cycles", (Reports useCase, CancellationToken ct) => useCase.ListAsync(ct));
    }
}
