using Microsoft.AspNetCore.Antiforgery;

namespace Budget.Api;

// ASP.NET Core antiforgery for a SPA: the cookie token is HttpOnly, the request token is handed over in a cookie the page
// can read, and the page sends it back in a header on every write. Both are protected by the Data Protection key ring.
internal static class Csrf
{
    public const string HeaderName = "X-XSRF-TOKEN";
    private const string RequestTokenCookie = "XSRF-TOKEN";

    public static IServiceCollection AddCsrf(this IServiceCollection services, IHostEnvironment environment) =>
        services.AddAntiforgery(o =>
        {
            o.HeaderName = HeaderName;
            o.Cookie.Name = "budget.csrf";
            o.Cookie.SameSite = SameSiteMode.Strict;
            o.Cookie.SecurePolicy = SecurePolicy(environment);
        });

    // Same rule as the session cookie: always Secure, except in Development, where it follows the request.
    public static CookieSecurePolicy SecurePolicy(IHostEnvironment environment) =>
        environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;

    // The request token is tied to whoever the caller is right now, so the page asks again after signing in or out.
    // Outside the strict /auth limit: every page load calls it.
    public static void MapCsrf(this IEndpointRouteBuilder app) =>
        app.MapGet("/auth/csrf", (HttpContext context, IAntiforgery antiforgery, IHostEnvironment environment) =>
        {
            var tokens = antiforgery.GetAndStoreTokens(context);
            context.Response.Cookies.Append(RequestTokenCookie, tokens.RequestToken!, new CookieOptions
            {
                HttpOnly = false,
                Secure = !environment.IsDevelopment() || context.Request.IsHttps,
                SameSite = SameSiteMode.Strict,
            });
            return Results.NoContent();
        });

    // UseAntiforgery only checks form-bound endpoints, and these take JSON, so every write is checked here instead.
    public static TBuilder RequireCsrfToken<TBuilder>(this TBuilder builder) where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(async (invocation, next) =>
        {
            var context = invocation.HttpContext;
            if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method))
            {
                try
                {
                    await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context);
                }
                catch (AntiforgeryValidationException)
                {
                    return Results.Problem(
                        statusCode: StatusCodes.Status400BadRequest,
                        detail: "The anti-forgery token is missing or not valid for this session.",
                        extensions: new Dictionary<string, object?> { ["code"] = "csrf.invalid" });
                }
            }

            return await next(invocation);
        });
}
