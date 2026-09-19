using System.Security.Claims;
using Budget.Application;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Budget.Api;

internal static class AuthEndpoints
{
    // Public and unauthenticated by nature, so it has the strict limit. /auth/login and /auth/callback (Entra) join this group in M5.
    public static void MapAuth(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/auth").RequireRateLimiting(RateLimiting.AuthPolicy);

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
