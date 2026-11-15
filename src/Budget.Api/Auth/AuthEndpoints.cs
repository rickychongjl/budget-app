using System.Security.Claims;
using Budget.Application;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Budget.Api;

internal static class AuthEndpoints
{
    // Public and unauthenticated by nature, so it has the strict limit.
    // /auth/callback is not here: the OpenID Connect middleware answers it before routing, under the global limit only.
    public static void MapAuth(this IEndpointRouteBuilder app, IConfiguration configuration)
    {
        // Which sign-ins this deployment offers ("demo" plus each configured provider), so the SPA draws a provider's button
        // only when it leads somewhere. Asking /auth/login instead would start a real challenge. Like /auth/csrf it is
        // outside the strict limit: every page load calls it.
        var providers = OidcSignIn.Configured(configuration).ToList();
        string[] signIn = ["demo", .. providers.Select(p => p.Name)];
        app.MapGet("/auth/options", () => Results.Ok(new { signIn }));

        var auth = app.MapGroup("/auth").RequireRateLimiting(RateLimiting.AuthPolicy).RequireCsrfToken();

        // A real navigation from the SPA: the provider's sign-in page, then back to the provider's callback path.
        foreach (var provider in providers)
        {
            app.MapGet(provider.LoginPath, () => Results.Challenge(new AuthenticationProperties { RedirectUri = "/" }, [provider.Name]))
                .RequireRateLimiting(RateLimiting.AuthPolicy);
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
