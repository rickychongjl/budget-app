using System.Security.Claims;
using Budget.Application;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;

namespace Budget.Api;

// A sign-in provider the server talks OpenID Connect to. Name is the ExternalId prefix ("google:<sub>"), the value
// /auth/options reports and the authentication scheme. Config names the section holding ClientId and ClientSecret.
// Sign in with Apple (L1b) is a second entry here with its own paths; its client secret is a signed JWT, not a setting.
internal sealed record OidcProvider(string Name, string Config, string Authority, string LoginPath, string CallbackPath, string[] Issuers)
{
    public bool IsConfigured(IConfiguration configuration) =>
        !string.IsNullOrWhiteSpace(configuration[$"{Config}:ClientId"]) && !string.IsNullOrWhiteSpace(configuration[$"{Config}:ClientSecret"]);
}

// The server does OpenID Connect (authorization code + PKCE, which the handler adds by default) against each configured
// provider, then issues the same session cookie a demo sign-in does. No token is kept and none reaches the browser.
internal static class OidcSignIn
{
    // Google's ID tokens may carry either issuer (https://developers.google.com/identity/openid-connect/openid-connect).
    public static readonly OidcProvider Google = new(
        "google", "Google", "https://accounts.google.com", "/auth/login", "/auth/callback", ["https://accounts.google.com", "accounts.google.com"]);

    public static readonly OidcProvider[] All = [Google];

    // Without their settings (docker compose, tests) a provider is left out; with none, the app runs demo-only.
    public static IEnumerable<OidcProvider> Configured(IConfiguration configuration) => All.Where(p => p.IsConfigured(configuration));

    public static AuthenticationBuilder AddOidcSignIn(this AuthenticationBuilder auth, IConfiguration configuration)
    {
        foreach (var provider in Configured(configuration))
        {
            auth.AddOpenIdConnect(provider.Name, o => Configure(o, provider, configuration));
        }

        return auth;
    }

    private static void Configure(OpenIdConnectOptions o, OidcProvider provider, IConfiguration configuration)
    {
        // The provider's metadata pins its issuer and signing keys; ValidIssuers adds the other spelling Google uses.
        o.Authority = provider.Authority;
        o.TokenValidationParameters.ValidIssuers = provider.Issuers;
        o.ClientId = configuration[$"{provider.Config}:ClientId"];
        o.ClientSecret = configuration[$"{provider.Config}:ClientSecret"];
        o.ResponseType = "code";
        o.CallbackPath = provider.CallbackPath;
        o.Scope.Clear();
        o.Scope.Add("openid");
        o.Scope.Add("email");
        o.Scope.Add("profile");
        // On a shared phone, signing out and in again must let the next person pick their own account.
        o.Prompt = "select_account";
        // Explicit, because the default scheme is not always the cookie (the API tests put their own in front).
        o.SignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        o.SaveTokens = false;
        o.GetClaimsFromUserInfoEndpoint = false;
        o.MapInboundClaims = false;

        o.Events.OnTokenValidated = async context =>
        {
            var token = context.Principal;
            var signIn = new ExternalSignIn(
                provider.Name,
                token?.FindFirstValue("sub"),
                token?.FindFirstValue("email"),
                bool.TryParse(token?.FindFirstValue("email_verified"), out var verified) && verified,
                token?.FindFirstValue("name"));

            var userId = await context.HttpContext.RequestServices.GetRequiredService<Login>()
                .ResolveAsync(signIn, context.HttpContext.RequestAborted);

            // The session carries the app's user id and nothing from the token.
            context.Principal = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId.ToString())],
                CookieAuthenticationDefaults.AuthenticationScheme));
            context.Properties!.IsPersistent = true;
        };

        // Every way the round trip can fail ends here: an unverified email, a bad signature, a cancelled sign-in.
        // The callback is a top-level navigation, so problem details would leave a person looking at raw JSON with no way
        // back. They go to the SPA's sign-in screen instead, which explains the code. No session is issued either way.
        // The code is one of ours (never text from the request), so the redirect cannot be steered elsewhere.
        // Only the code and the provider are logged: never the email or the subject.
        o.Events.OnRemoteFailure = context =>
        {
            var code = context.Failure is ForbiddenException refused ? refused.Code : "auth.failed";
            context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(OidcSignIn))
                .LogWarning("Sign-in refused: {Code} ({Provider})", code, provider.Name);

            context.HandleResponse();
            context.Response.Redirect($"/signin?error={Uri.EscapeDataString(code)}");
            return Task.CompletedTask;
        };
    }
}
