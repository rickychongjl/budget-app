using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Web;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Budget.Api.Tests;

// The real OpenID Connect middleware end to end, with no network: the tenant's metadata is fixed in memory with a test
// signing key, and the token endpoint is a stub that answers with an ID token signed by that key.
[Collection(ApiCollection.Name)]
public sealed class EntraSignInTests(ApiFactory api)
{
    private const string Issuer = "https://login.test/tenant/v2.0";
    private const string ClientId = "budget-client";
    private static readonly RsaSecurityKey Key = new(RSA.Create(2048)) { KeyId = "test" };
    private static readonly WebApplicationFactoryClientOptions Https = new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false };

    private WebApplicationFactory<Program> Host(string allowedOids, TokenEndpoint tokens) => api.WithWebHostBuilder(b => b
        .UseSetting("Entra:TenantId", "tenant")
        .UseSetting("Entra:ClientId", ClientId)
        .UseSetting("Entra:ClientSecret", "secret")
        .UseSetting("Auth:AllowedOids", allowedOids)
        .ConfigureTestServices(services => services.PostConfigure<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme, o =>
        {
            var configuration = new OpenIdConnectConfiguration
            {
                Issuer = Issuer,
                AuthorizationEndpoint = "https://login.test/tenant/authorize",
                TokenEndpoint = "https://login.test/tenant/token",
            };
            configuration.SigningKeys.Add(Key);
            // The handler has already built a manager that fetches the metadata, so replace that rather than set Configuration.
            o.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(configuration);
            o.Backchannel = new HttpClient(tokens);
        })));

    // Walks the browser's part: /auth/login, then Entra posting the code back to /auth/callback.
    private static async Task<HttpResponseMessage> SignInAsync(HttpClient client, TokenEndpoint tokens, string oid, SecurityKey? signedWith = null)
    {
        var login = await client.GetAsync("/auth/login");
        login.StatusCode.Should().Be(HttpStatusCode.Redirect);
        var authorize = HttpUtility.ParseQueryString(login.Headers.Location!.Query);

        tokens.IdToken = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = ClientId,
            Subject = new ClaimsIdentity([new Claim("sub", "subject"), new Claim("oid", oid), new Claim("nonce", authorize["nonce"]!), new Claim("name", "Someone Real")]),
            SigningCredentials = new SigningCredentials(signedWith ?? Key, SecurityAlgorithms.RsaSha256),
        });

        return await client.PostAsync("/auth/callback", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["code"] = "one-time-code",
            ["state"] = authorize["state"]!,
        }));
    }

    [Fact]
    public async Task Login_redirects_to_the_tenant_with_the_code_flow_and_pkce()
    {
        await using var host = Host("", new TokenEndpoint());

        var response = await host.CreateClient(Https).GetAsync("/auth/login");

        response.StatusCode.Should().Be(HttpStatusCode.Redirect);
        response.Headers.Location!.GetLeftPart(UriPartial.Path).Should().Be("https://login.test/tenant/authorize");
        var query = HttpUtility.ParseQueryString(response.Headers.Location.Query);
        query["response_type"].Should().Be("code");
        query["client_id"].Should().Be(ClientId);
        query["redirect_uri"].Should().Be("https://localhost/auth/callback");
        query["code_challenge"].Should().NotBeNullOrEmpty();
        query["code_challenge_method"].Should().Be("S256");
    }

    [Fact]
    public async Task An_allowed_oid_with_a_user_row_gets_the_hardened_thirty_day_session()
    {
        var oid = Guid.NewGuid().ToString();
        var user = await api.NewUserAsync(externalId: oid);
        var tokens = new TokenEndpoint();
        await using var host = Host(oid, tokens);
        var client = host.CreateClient(Https);

        var callback = await SignInAsync(client, tokens, oid);

        callback.StatusCode.Should().Be(HttpStatusCode.Redirect);
        callback.Headers.Location!.OriginalString.Should().Be("/");
        tokens.Requests.Should().ContainSingle().Which.Should().Contain("code_verifier=").And.Contain("code=one-time-code");

        var cookie = callback.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("budget.session=", StringComparison.Ordinal)).ToLowerInvariant();
        cookie.Should().Contain("httponly").And.Contain("; secure").And.Contain("samesite=strict");
        var expires = cookie.Split(';').Select(p => p.Trim()).Single(p => p.StartsWith("expires=", StringComparison.Ordinal));
        DateTimeOffset.Parse(expires["expires=".Length..]).Should().BeCloseTo(DateTimeOffset.UtcNow.AddDays(30), TimeSpan.FromMinutes(5));

        var me = await client.GetFromJsonAsync<JsonElement>("/api/me");
        me.GetProperty("isDemo").GetBoolean().Should().BeFalse();
        me.GetProperty("displayName").GetString().Should().Be(user.DisplayName, "nothing from the token is copied onto the user");
    }

    [Fact]
    public async Task An_oid_that_is_not_on_the_allowlist_is_403_with_no_session()
    {
        var oid = Guid.NewGuid().ToString();
        await api.NewUserAsync(externalId: oid);
        var tokens = new TokenEndpoint();
        await using var host = Host(Guid.NewGuid().ToString(), tokens);
        var client = host.CreateClient(Https);

        await ShouldBeRefused(await SignInAsync(client, tokens, oid), client);
    }

    [Fact]
    public async Task An_allowed_oid_without_a_user_row_is_403_with_no_session()
    {
        var oid = Guid.NewGuid().ToString();
        var tokens = new TokenEndpoint();
        await using var host = Host(oid, tokens);
        var client = host.CreateClient(Https);

        await ShouldBeRefused(await SignInAsync(client, tokens, oid), client);
    }

    [Fact]
    public async Task A_token_signed_by_someone_else_is_403_with_no_session()
    {
        var oid = Guid.NewGuid().ToString();
        await api.NewUserAsync(externalId: oid);
        var tokens = new TokenEndpoint();
        await using var host = Host(oid, tokens);
        var client = host.CreateClient(Https);

        var callback = await SignInAsync(client, tokens, oid, signedWith: new RsaSecurityKey(RSA.Create(2048)) { KeyId = "test" });

        await HostTests.ShouldBeProblem(callback, HttpStatusCode.Forbidden, "auth.failed");
        (await client.GetAsync("/api/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Without_entra_settings_there_is_no_login_route()
    {
        var response = await api.CreateClient(Https).GetAsync("/auth/login");

        await HostTests.ShouldBeProblem(response, HttpStatusCode.NotFound, "http.404");
    }

    private static async Task ShouldBeRefused(HttpResponseMessage callback, HttpClient client)
    {
        await HostTests.ShouldBeProblem(callback, HttpStatusCode.Forbidden, "auth.not-allowed");
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
