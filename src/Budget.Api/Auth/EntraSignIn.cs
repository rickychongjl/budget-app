using System.Security.Claims;
using Budget.Application;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Mvc;

namespace Budget.Api;

// The server does OpenID Connect against the one Entra tenant (authorization code + PKCE, which the handler adds by default),
// then issues the same session cookie a demo sign-in does. No token is kept and none reaches the browser.
internal static class EntraSignIn
{
    // Without these settings (docker compose, tests) the app runs demo-only and /auth/login does not exist.
    public static bool IsConfigured(IConfiguration configuration) => !string.IsNullOrWhiteSpace(configuration["Entra:ClientId"]);

    public static AuthenticationBuilder AddEntraSignIn(this AuthenticationBuilder auth, IConfiguration configuration) =>
        !IsConfigured(configuration) ? auth : auth.AddOpenIdConnect(o =>
        {
            // The tenant's own authority, not /common: its metadata pins the issuer, so another tenant's token fails validation.
            o.Authority = $"https://login.microsoftonline.com/{configuration["Entra:TenantId"]}/v2.0";
            o.ClientId = configuration["Entra:ClientId"];
            o.ClientSecret = configuration["Entra:ClientSecret"];
            o.ResponseType = "code";
            o.CallbackPath = "/auth/callback";
            // Explicit, because the default scheme is not always the cookie (the API tests put their own in front).
            o.SignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            o.SaveTokens = false;
            o.GetClaimsFromUserInfoEndpoint = false;
            o.MapInboundClaims = false;

            o.Events.OnTokenValidated = async context =>
            {
                var userId = await context.HttpContext.RequestServices.GetRequiredService<Login>()
                    .ResolveAsync(context.Principal?.FindFirstValue("oid"), context.HttpContext.RequestAborted);

                // The session carries the app's user id and nothing from the token.
                context.Principal = new ClaimsPrincipal(new ClaimsIdentity(
                    [new Claim(ClaimTypes.NameIdentifier, userId.ToString())],
                    CookieAuthenticationDefaults.AuthenticationScheme));
                context.Properties!.IsPersistent = true;
            };

            // Every way the round trip can fail ends here: a refused oid, a bad signature, a cancelled sign-in.
            o.Events.OnRemoteFailure = async context =>
            {
                var code = context.Failure is ForbiddenException refused ? refused.Code : "auth.failed";
                context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(EntraSignIn))
                    .LogWarning("Sign-in refused: {Code}", code);

                context.HandleResponse();
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.HttpContext.RequestServices.GetRequiredService<IProblemDetailsService>().TryWriteAsync(new ProblemDetailsContext
                {
                    HttpContext = context.HttpContext,
                    ProblemDetails = new ProblemDetails
                    {
                        Status = StatusCodes.Status403Forbidden,
                        Detail = "The sign-in was not accepted.",
                        Extensions = { ["code"] = code },
                    },
                });
            };
        });
}
