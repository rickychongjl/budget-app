using System.Security.Claims;
using Budget.Application;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;

namespace Budget.Api;

internal static class AuthEndpoints
{
    // Public and unauthenticated by nature, so it has the strict limit.
    // /auth/callback is not here: the OpenID Connect middleware answers it before routing, under the global limit only.
    public static void MapAuth(this IEndpointRouteBuilder app, IConfiguration configuration)
    {
        var auth = app.MapGroup("/auth").RequireRateLimiting(RateLimiting.AuthPolicy).RequireCsrfToken();

        if (EntraSignIn.IsConfigured(configuration))
        {
            auth.MapGet("/login", () => Results.Challenge(
                new AuthenticationProperties { RedirectUri = "/" },
                [OpenIdConnectDefaults.AuthenticationScheme]));
        }

        // The same cookie a real login issues, for the demo user, with a fixed four-hour life that does not slide.
        auth.MapPost("/demo", async (HttpContext context, DemoUser demo, TimeProvider clock, CancellationToken ct) =>
        {
            var identity = new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, (await demo.GetIdAsync(ct)).ToString())],
                CookieAuthenticationDefaults.AuthenticationScheme);

            await context.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(identity),
                new AuthenticationProperties { IsPersistent = true, AllowRefresh = false, ExpiresUtc = clock.GetUtcNow().AddHours(4) });
            return Results.NoContent();
        });

        auth.MapPost("/logout", async (HttpContext context) =>
        {
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        });
    }
}
