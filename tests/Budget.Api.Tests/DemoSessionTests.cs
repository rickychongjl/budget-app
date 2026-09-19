using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Budget.Application;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Budget.Api.Tests;

// No X-Test-User header anywhere in this file: these requests are recognised by the real session cookie.
[Collection(ApiCollection.Name)]
public sealed class DemoSessionTests(ApiFactory api)
{
    // The cookie is Secure, so the client has to believe it is talking https to send it back.
    private static readonly WebApplicationFactoryClientOptions Https = new() { BaseAddress = new Uri("https://localhost") };

    private async Task EnsureDemoUserAsync()
    {
        using var scope = api.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<DemoUser>().EnsureExistsAsync();
    }

    [Fact]
    public async Task A_demo_session_signs_in_with_a_hardened_cookie_and_logout_ends_it()
    {
        await EnsureDemoUserAsync();
        var client = api.CreateClient(Https);

        var signIn = await client.PostAsync("/auth/demo", null);

        signIn.StatusCode.Should().Be(HttpStatusCode.NoContent);
        var cookie = signIn.Headers.GetValues("Set-Cookie").Should().ContainSingle().Subject.ToLowerInvariant();
        cookie.Should().StartWith("budget.session=").And.Contain("httponly").And.Contain("secure").And.Contain("samesite=strict").And.Contain("expires=");
        (await client.GetFromJsonAsync<JsonElement>("/api/me")).GetProperty("isDemo").GetBoolean().Should().BeTrue();

        var signOut = await client.PostAsync("/auth/logout", null);

        signOut.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await client.GetAsync("/api/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // Clients will not send a Secure cookie back over plain http, which is what local development uses.
    // So Development follows the request scheme, and everything else is Secure no matter how the request arrived.
    [Theory]
    [InlineData("Production", true)]
    [InlineData("Development", false)]
    public async Task Over_plain_http_the_cookie_is_secure_everywhere_except_development(string environment, bool secure)
    {
        await EnsureDemoUserAsync();
        await using var host = api.WithWebHostBuilder(b => b.UseEnvironment(environment));

        var signIn = await host.CreateClient().PostAsync("/auth/demo", null);

        var cookie = signIn.Headers.GetValues("Set-Cookie").Single().ToLowerInvariant();
        cookie.Contains("; secure").Should().Be(secure);
        cookie.Should().Contain("httponly").And.Contain("samesite=strict");
    }

    [Fact]
    public async Task The_demo_session_lasts_four_hours_and_does_not_slide()
    {
        await EnsureDemoUserAsync();

        var signIn = await api.CreateClient(Https).PostAsync("/auth/demo", null);

        var expires = signIn.Headers.GetValues("Set-Cookie").Single().Split(';').Select(p => p.Trim()).Single(p => p.StartsWith("expires=", StringComparison.OrdinalIgnoreCase));
        var at = DateTimeOffset.Parse(expires["expires=".Length..]);
        at.Should().BeCloseTo(DateTimeOffset.UtcNow.AddHours(4), TimeSpan.FromMinutes(1));
    }

    [Fact]
    public async Task Demo_sign_in_has_its_own_stricter_limit()
    {
        await EnsureDemoUserAsync();
        await using var strict = api.WithWebHostBuilder(b => b.UseSetting("RateLimiting:AuthPermitLimit", "2"));
        var client = strict.CreateClient(Https);

        (await client.PostAsync("/auth/demo", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await client.PostAsync("/auth/demo", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var rejected = await client.PostAsync("/auth/demo", null);

        await HostTests.ShouldBeProblem(rejected, HttpStatusCode.TooManyRequests, "rate-limited");
        (await client.GetAsync("/api/me")).StatusCode.Should().Be(HttpStatusCode.OK, "the general limit is separate");
    }
}
