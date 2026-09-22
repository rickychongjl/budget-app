using Microsoft.AspNetCore.HttpOverrides;

namespace Budget.Api;

// What sits between the phone and the app: Cloudflare, then the Container Apps ingress. TLS ends at the ingress, so a
// request arrives as plain http from an address inside the environment. The forwarded headers put the scheme and the
// caller's address back before anything reads them (Secure cookies, antiforgery, the OpenID Connect redirect_uri, HSTS,
// the rate limiter). The response headers are design section 6.
internal static class Edge
{
    private const string ContentSecurityPolicy =
        // Scripts, fonts, fetches, the worker and the manifest are all same-origin. Styles allow inline because React sets
        // style attributes (a progress bar's width, a category's colour) and Recharts does the same on its SVG.
        "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

    public static void UseEdge(this WebApplication app)
    {
        var forwarded = new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor,
            // Cloudflare sets this on every request and overwrites whatever the client sent, so no hop count is needed.
            // X-Forwarded-For would need one (the client's own entries come first) and, until the ingress is restricted
            // to Cloudflare's ranges, would let a caller choose its rate-limit bucket. Without Cloudflare in front the
            // header is absent and every caller shares the ingress's address, which is the pre-M9 behaviour.
            ForwardedForHeaderName = "CF-Connecting-IP",
        };
        // The ingress is the proxy and its addresses cannot be listed, so the headers are trusted from any connection.
        // Locally there is no proxy to hide behind and nothing to protect.
        forwarded.KnownIPNetworks.Clear();
        forwarded.KnownProxies.Clear();
        app.UseForwardedHeaders(forwarded);

        if (!app.Environment.IsDevelopment())
        {
            // The default is thirty days without preload, which is what the design asks for in the first month.
            app.UseHsts();
        }

        app.Use(async (context, next) =>
        {
            var headers = context.Response.Headers;
            headers.ContentSecurityPolicy = ContentSecurityPolicy;
            headers.XContentTypeOptions = "nosniff";
            headers["Referrer-Policy"] = "no-referrer";
            headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
            await next(context);
        });
    }
}
