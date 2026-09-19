using System.Globalization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Mvc;

namespace Budget.Api;

internal static class RateLimiting
{
    // One sliding window per client address over everything except liveness. Defaults: 100 requests a minute.
    // ponytail: behind Cloudflare and the Container Apps ingress every request arrives from the proxy's address,
    // so until M9 configures forwarded headers this is one shared bucket in production. Locally it is per client.
    public const string AuthPolicy = "auth";

    public static IServiceCollection AddBudgetRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var permitLimit = configuration.GetValue("RateLimiting:PermitLimit", 100);
        var authPermitLimit = configuration.GetValue("RateLimiting:AuthPermitLimit", 5);
        var window = TimeSpan.FromSeconds(configuration.GetValue("RateLimiting:WindowSeconds", 60));

        return services.AddRateLimiter(o =>
        {
            // On top of the global limit, for /auth/*: 5 a minute per address.
            // ponytail: the design also suggests 20 a day. A second, day-long window needs a chained limiter; add it if the demo gets hammered.
            o.AddPolicy(AuthPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = authPermitLimit, Window = window }));

            o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                context.Request.Path.StartsWithSegments("/health")
                    ? RateLimitPartition.GetNoLimiter("health")
                    : RateLimitPartition.GetSlidingWindowLimiter(
                        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                        _ => new SlidingWindowRateLimiterOptions { PermitLimit = permitLimit, Window = window, SegmentsPerWindow = 6 }));

            o.OnRejected = async (rejected, ct) =>
            {
                var retryAfter = rejected.Lease.TryGetMetadata(MetadataName.RetryAfter, out var wait) ? wait : window;
                var response = rejected.HttpContext.Response;
                response.StatusCode = StatusCodes.Status429TooManyRequests;
                response.Headers.RetryAfter = Math.Ceiling(retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);

                await rejected.HttpContext.RequestServices.GetRequiredService<IProblemDetailsService>().TryWriteAsync(new ProblemDetailsContext
                {
                    HttpContext = rejected.HttpContext,
                    ProblemDetails = new ProblemDetails
                    {
                        Status = StatusCodes.Status429TooManyRequests,
                        Detail = "Too many requests. Try again shortly.",
                        Extensions = { ["code"] = "rate-limited" },
                    },
                });
            };
        });
    }
}
