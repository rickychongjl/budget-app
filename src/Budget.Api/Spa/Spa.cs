using Microsoft.Net.Http.Headers;

namespace Budget.Api;

internal static class Spa
{
    // Vite names everything under /assets by content hash, so those never change and can be kept for good.
    // The page that points at them must be checked on every load, or a deployment would not be picked up.
    public static readonly StaticFileOptions Files = new()
    {
        OnPrepareResponse = context => context.Context.Response.Headers[HeaderNames.CacheControl] =
            context.Context.Request.Path.StartsWithSegments("/assets") ? "public, max-age=31536000, immutable" : "no-cache",
    };

    // React Router owns every path the server does not, so a reload of /cycles/<id> gets the page and the router takes over.
    // The server's own prefixes stay a 404: a mistyped /auth or /health path must not look like a success.
    public static void MapSpaFallback(this WebApplication app)
    {
        foreach (var prefix in (string[])["/auth", "/health"])
        {
            app.MapFallback(prefix + "/{**rest}", () => Results.NotFound());
        }

        app.MapFallbackToFile("index.html", Files);
    }
}
