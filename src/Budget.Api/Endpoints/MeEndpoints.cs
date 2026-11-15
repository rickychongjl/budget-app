using Budget.Application;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;

namespace Budget.Api;

internal static class MeEndpoints
{
    public static void MapMe(this IEndpointRouteBuilder api)
    {
        api.MapGet("/me", (Me me, CancellationToken ct) => me.GetAsync(ct));
        api.MapPatch("/me", (UpdateMeRequest request, Me me, CancellationToken ct) => me.UpdateAsync(request, ct));

        // The whole archive is built in memory before a byte is sent. It is small (a few thousand rows, compressed), the ZIP
        // writer's synchronous writes never touch the response (Kestrel refuses those), and a failure part-way is still a
        // problem response rather than a truncated file. A GET, so the antiforgery filter lets it through.
        api.MapGet("/me/export", async (ExportData export, HttpResponse response, CancellationToken ct) =>
        {
            var data = await export.GetAsync(ct);
            var archive = new MemoryStream();
            ExportArchive.Write(data, archive);
            archive.Position = 0;

            response.Headers.ContentDisposition = $"attachment; filename=\"{data.FileName}\"";
            // Someone's whole financial history: no shared or browser cache keeps a copy.
            response.Headers.CacheControl = "no-store";
            return Results.Stream(archive, ExportArchive.ContentType);
        }).RequireRateLimiting(RateLimiting.ExportPolicy);

        // Decision D5: gone at once, after the person types the confirmation. Under the /api group, so antiforgery-checked.
        // The body is optional to the binder so that a missing one is refused like a wrong word (422 with the code), not as
        // an unreadable request. The session ends whether the account was deleted now or was already gone.
        api.MapDelete("/me", async ([FromBody] DeleteAccountRequest? request, DeleteAccount deleteAccount, HttpContext context, CancellationToken ct) =>
        {
            await deleteAccount.RunAsync(request, ct);
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        });
    }
}
