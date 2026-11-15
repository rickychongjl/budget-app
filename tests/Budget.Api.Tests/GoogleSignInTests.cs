using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Web;
using Budget.Infrastructure;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Budget.Api.Tests;

// The real OpenID Connect middleware end to end, with no network: Google's metadata is fixed in memory with a test
// signing key, and the token endpoint is a stub that answers with an ID token signed by that key.
// (Rewritten from EntraSignInTests when Google replaced Entra; the session and refusal rules are the same.)
[Collection(ApiCollection.Name)]
public sealed class GoogleSignInTests(ApiFactory api)
{
    private const string Issuer = "https://accounts.google.com";
    private const string ClientId = "budget-client.apps.googleusercontent.com";
    private const string AdoptEmail = "owner@example.com";
    private static readonly RsaSecurityKey Key = new(RSA.Create(2048)) { KeyId = "test" };
    private static readonly WebApplicationFactoryClientOptions Https = new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false };

    private WebApplicationFactory<Program> Host(TokenEndpoint tokens, string adoptEmail = "") => api.WithWebHostBuilder(b => b
        .UseSetting("Google:ClientId", ClientId)
        .UseSetting("Google:ClientSecret", "secret")
        .UseSetting("Auth:AdoptLegacyUserEmail", adoptEmail)
        .ConfigureTestServices(services => services.PostConfigure<OpenIdConnectOptions>("google", o =>
        {
            var configuration = new OpenIdConnectConfiguration
            {
                Issuer = Issuer,
                AuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth",
                TokenEndpoint = "https://oauth2.googleapis.com/token",
            };
            configuration.SigningKeys.Add(Key);
            // The handler has already built a manager that fetches the metadata, so replace that rather than set Configuration.
            o.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(configuration);
            o.Backchannel = new HttpClient(tokens);
        })));

    private static string NewSubject() => Random.Shared.NextInt64(100_000_000_000_000, 999_999_999_999_999).ToString();

    // Walks the browser's part: /auth/login, then Google posting the code back to /auth/callback.
    private static async Task<HttpResponseMessage> SignInAsync(
        HttpClient client, TokenEndpoint tokens, string subject, string email = "someone@example.com", bool emailVerified = true,
        string issuer = Issuer, SecurityKey? signedWith = null)
    {
        var login = await client.GetAsync("/auth/login");
        login.StatusCode.Should().Be(HttpStatusCode.Redirect);
        var authorize = HttpUtility.ParseQueryString(login.Headers.Location!.Query);

        tokens.IdToken = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = ClientId,
            Claims = new Dictionary<string, object>
            {
                ["sub"] = subject,
                ["email"] = email,
                ["email_verified"] = emailVerified,
                ["name"] = "Someone Real",
                ["nonce"] = authorize["nonce"]!,
            },
            SigningCredentials = new SigningCredentials(signedWith ?? Key, SecurityAlgorithms.RsaSha256),
        });

        return await client.PostAsync("/auth/callback", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["code"] = "one-time-code",
            ["state"] = authorize["state"]!,
        }));
    }

    private async Task<Budget.Domain.User?> UserByExternalIdAsync(string externalId)
    {
        using var scope = api.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<BudgetDbContext>().Users.AsNoTracking().SingleOrDefaultAsync(u => u.ExternalId == externalId);
    }

    [Fact]
    public async Task Login_redirects_to_google_with_the_code_flow_pkce_and_the_three_scopes()
    {
        await using var host = Host(new TokenEndpoint());

        var response = await host.CreateClient(Https).GetAsync("/auth/login");

        response.StatusCode.Should().Be(HttpStatusCode.Redirect);
        response.Headers.Location!.GetLeftPart(UriPartial.Path).Should().Be("https://accounts.google.com/o/oauth2/v2/auth");
        var query = HttpUtility.ParseQueryString(response.Headers.Location.Query);
        query["response_type"].Should().Be("code");
        query["client_id"].Should().Be(ClientId);
        query["redirect_uri"].Should().Be("https://localhost/auth/callback");
        query["scope"]!.Split(' ').Should().BeEquivalentTo("openid", "email", "profile");
        query["prompt"].Should().Be("select_account");
        query["code_challenge"].Should().NotBeNullOrEmpty();
        query["code_challenge_method"].Should().Be("S256");
    }

    // Google only accepts a registered redirect URI, and behind the ingress the request itself is http.
    [Fact]
    public async Task Behind_the_ingress_the_redirect_uri_is_https()
    {
        await using var host = Host(new TokenEndpoint());
        var client = host.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https");

        var response = await client.GetAsync("/auth/login");

        HttpUtility.ParseQueryString(response.Headers.Location!.Query)["redirect_uri"].Should().Be("https://localhost/auth/callback");
    }

    [Fact]
    public async Task A_first_sign_in_creates_the_account_and_gets_the_hardened_thirty_day_session()
    {
        var subject = NewSubject();
        var tokens = new TokenEndpoint();
        await using var host = Host(tokens);
        var client = host.CreateClient(Https);

        var callback = await SignInAsync(client, tokens, subject);

        callback.StatusCode.Should().Be(HttpStatusCode.Redirect);
        callback.Headers.Location!.OriginalString.Should().Be("/");
        tokens.Requests.Should().ContainSingle().Which.Should().Contain("code_verifier=").And.Contain("code=one-time-code");

        var cookie = callback.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("budget.session=", StringComparison.Ordinal)).ToLowerInvariant();
        cookie.Should().Contain("httponly").And.Contain("; secure").And.Contain("samesite=strict");
        var expires = cookie.Split(';').Select(p => p.Trim()).Single(p => p.StartsWith("expires=", StringComparison.Ordinal));
        DateTimeOffset.Parse(expires["expires=".Length..]).Should().BeCloseTo(DateTimeOffset.UtcNow.AddDays(30), TimeSpan.FromMinutes(5));

        var me = await client.GetFromJsonAsync<JsonElement>("/api/me");
        me.GetProperty("isDemo").GetBoolean().Should().BeFalse();
        me.GetProperty("displayName").GetString().Should().Be("Someone Real");

        var user = await UserByExternalIdAsync("google:" + subject);
        user!.Id.Should().Be(me.GetProperty("id").GetGuid());
        user.Email.Should().Be("someone@example.com");
    }

    [Fact]
    public async Task Signing_in_again_finds_the_same_account()
    {
        var subject = NewSubject();
        var tokens = new TokenEndpoint();
        await using var host = Host(tokens);

        var first = host.CreateClient(Https);
        await SignInAsync(first, tokens, subject);
        var second = host.CreateClient(Https);
        await SignInAsync(second, tokens, subject, email: "changed@example.com");

        var firstId = (await first.GetFromJsonAsync<JsonElement>("/api/me")).GetProperty("id").GetGuid();
        (await second.GetFromJsonAsync<JsonElement>("/api/me")).GetProperty("id").GetGuid().Should().Be(firstId);
        (await UserByExternalIdAsync("google:" + subject))!.Email.Should().Be("changed@example.com");
    }

    // Google's own tokens can carry the issuer without the scheme.
    [Fact]
    public async Task The_bare_google_issuer_is_accepted_too()
    {
        var tokens = new TokenEndpoint();
        await using var host = Host(tokens);
        var client = host.CreateClient(Https);

        var callback = await SignInAsync(client, tokens, NewSubject(), issuer: "accounts.google.com");

        callback.Headers.Location!.OriginalString.Should().Be("/");
        (await client.GetAsync("/api/me")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // Two strangers who signed themselves up are as separate as any two users: the tenant filter applies to them as well.
    [Fact]
    public async Task Two_people_who_signed_up_cannot_see_each_others_data()
    {
        var tokens = new TokenEndpoint();
        await using var host = Host(tokens);
        var a = host.CsrfClient(Https);
        var b = host.CsrfClient(Https);
        await SignInAsync(a, tokens, NewSubject(), email: "a@example.com");
        await SignInAsync(b, tokens, NewSubject(), email: "b@example.com");

        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Australia/Sydney"));
        var created = await a.PostAsJsonAsync("/api/cycles", new { startDate = today.ToString("yyyy-MM-dd") });
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var cycleId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        (await b.GetFromJsonAsync<JsonElement>("/api/me")).GetProperty("id").GetGuid()
            .Should().NotBe((await a.GetFromJsonAsync<JsonElement>("/api/me")).GetProperty("id").GetGuid());
        (await b.GetAsync($"/api/cycles/{cycleId}")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await b.GetFromJsonAsync<JsonElement>("/api/cycles")).GetArrayLength().Should().Be(0);
    }

    // The original account, still keyed by its Entra oid, is taken over by its owner's first Google sign-in.
    // The other adoption cases (wrong email, ambiguous rows, already linked) are in LoginTests and LegacyAccountAdoptionTests.
    [Fact]
    public async Task The_owners_first_google_sign_in_adopts_the_original_account()
    {
        var legacy = await api.NewUserAsync(externalId: Guid.NewGuid().ToString());
        var subject = NewSubject();
        var tokens = new TokenEndpoint();
        await using var host = Host(tokens, adoptEmail: AdoptEmail);
        var client = host.CreateClient(Https);

        await SignInAsync(client, tokens, subject, email: AdoptEmail);

        var me = await client.GetFromJsonAsync<JsonElement>("/api/me");
        me.GetProperty("id").GetGuid().Should().Be(legacy.Id);
        me.GetProperty("displayName").GetString().Should().Be(legacy.DisplayName, "adoption keeps the account as it was");
        (await UserByExternalIdAsync("google:" + subject))!.Id.Should().Be(legacy.Id);
    }

    [Fact]
    public async Task An_unverified_email_is_sent_back_to_sign_in_with_no_session_and_no_account()
    {
        var subject = NewSubject();
        var tokens = new TokenEndpoint();
        await using var host = Host(tokens);
        var client = host.CreateClient(Https);

        await ShouldBeRefused(await SignInAsync(client, tokens, subject, emailVerified: false), client, "auth.email-unverified");
        (await UserByExternalIdAsync("google:" + subject)).Should().BeNull();
    }

    [Fact]
    public async Task A_token_signed_by_someone_else_is_sent_back_to_sign_in_with_no_session()
    {
        var subject = NewSubject();
        var tokens = new TokenEndpoint();
        await using var host = Host(tokens);
        var client = host.CreateClient(Https);

        var callback = await SignInAsync(client, tokens, subject, signedWith: new RsaSecurityKey(RSA.Create(2048)) { KeyId = "test" });

        await ShouldBeRefused(callback, client, "auth.failed");
        (await UserByExternalIdAsync("google:" + subject)).Should().BeNull();
    }

    [Fact]
    public async Task A_token_from_another_issuer_is_sent_back_to_sign_in_with_no_session()
    {
        var tokens = new TokenEndpoint();
        await using var host = Host(tokens);
        var client = host.CreateClient(Https);

        await ShouldBeRefused(await SignInAsync(client, tokens, NewSubject(), issuer: "https://login.example.com"), client, "auth.failed");
    }

    [Fact]
    public async Task Without_google_settings_there_is_no_login_route()
    {
        var response = await api.CreateClient(Https).GetAsync("/auth/login");

        await HostTests.ShouldBeProblem(response, HttpStatusCode.NotFound, "http.404");
    }

    // A client id without its secret would draw a button whose round trip cannot finish, so it counts as not configured.
    [Fact]
    public async Task A_client_id_without_a_secret_is_not_configured()
    {
        await using var host = api.WithWebHostBuilder(b => b.UseSetting("Google:ClientId", ClientId));

        var options = await host.CreateClient(Https).GetFromJsonAsync<JsonElement>("/auth/options");

        options.GetProperty("signIn").EnumerateArray().Select(s => s.GetString()).Should().Equal("demo");
        (await host.CreateClient(Https).GetAsync("/auth/login")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Options_lists_google_when_it_is_configured()
    {
        await using var host = Host(new TokenEndpoint());

        var options = await host.CreateClient(Https).GetFromJsonAsync<JsonElement>("/auth/options");

        options.GetProperty("signIn").EnumerateArray().Select(s => s.GetString()).Should().Equal("demo", "google");
    }

    [Fact]
    public async Task Options_lists_only_the_demo_without_google_settings_and_needs_no_session()
    {
        var options = await api.CreateClient(Https).GetFromJsonAsync<JsonElement>("/auth/options");

        options.GetProperty("signIn").EnumerateArray().Select(s => s.GetString()).Should().Equal("demo");
    }

    // The callback is a top-level navigation, so a refusal goes to a screen a person can read, not to problem details.
    // What matters for security is unchanged: no session comes out of it.
    private static async Task ShouldBeRefused(HttpResponseMessage callback, HttpClient client, string code)
    {
        callback.StatusCode.Should().Be(HttpStatusCode.Redirect);
        callback.Headers.Location!.OriginalString.Should().Be($"/signin?error={code}");
        callback.Headers.TryGetValues("Set-Cookie", out var cookies);
        (cookies ?? []).Should().NotContain(c => c.StartsWith("budget.session=", StringComparison.Ordinal) && !c.StartsWith("budget.session=;", StringComparison.Ordinal));
        (await client.GetAsync("/api/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private sealed class TokenEndpoint : HttpMessageHandler
    {
        public string IdToken { get; set; } = "";
        public List<string> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Requests.Add(await request.Content!.ReadAsStringAsync(ct));
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new { token_type = "Bearer", access_token = "unused", id_token = IdToken }),
            };
        }
    }
}
