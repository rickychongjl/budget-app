using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Budget.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class HostTests(ApiFactory api)
{
    [Fact]
    public async Task Health_is_liveness_only_and_answers_without_a_database()
    {
        await using var noDatabase = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
            b.UseSetting("ConnectionStrings:Budget", "Server=127.0.0.1,1;Database=none;User Id=none;Password=none;Connect Timeout=1;Encrypt=false"));

        var response = await noDatabase.CreateClient().GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Ready_pings_the_database()
    {
        var response = await api.CreateClient().GetAsync("/health/ready");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Api_without_a_session_is_401_problem_details()
    {
        var response = await api.CreateClient().GetAsync("/api/me");

        await ShouldBeProblem(response, HttpStatusCode.Unauthorized, "http.401");
    }

    [Fact]
    public async Task Unknown_api_route_is_404_problem_details()
    {
        var client = api.ClientFor(await api.NewUserAsync());

        var response = await client.GetAsync("/api/nope");

        await ShouldBeProblem(response, HttpStatusCode.NotFound, "http.404");
    }

    [Fact]
    public async Task Me_returns_the_profile()
    {
        var user = await api.NewUserAsync();

        var me = await api.ClientFor(user).GetFromJsonAsync<JsonElement>("/api/me");

        me.GetProperty("displayName").GetString().Should().Be("Test");
        me.GetProperty("timeZone").GetString().Should().Be("Australia/Sydney");
        me.GetProperty("currency").GetString().Should().Be("AUD");
        me.GetProperty("isDemo").GetBoolean().Should().BeFalse();
        me.GetProperty("cycleLengthDays").GetInt32().Should().Be(30);
    }

    [Fact]
    public async Task A_session_for_a_user_that_no_longer_exists_is_404_problem_details()
    {
        var client = api.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuth.Header, Guid.NewGuid().ToString());

        var response = await client.GetAsync("/api/me");

        await ShouldBeProblem(response, HttpStatusCode.NotFound, "user.not-found");
    }

    [Fact]
    public async Task Every_response_carries_the_security_headers()
    {
        var headers = (await api.CreateClient().GetAsync("/health")).Headers;

        headers.GetValues("Content-Security-Policy").Single().Should().Be(
            "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
        headers.GetValues("X-Content-Type-Options").Single().Should().Be("nosniff");
        headers.GetValues("Referrer-Policy").Single().Should().Be("no-referrer");
        headers.GetValues("Permissions-Policy").Single().Should().Be("camera=(), microphone=(), geolocation=()");
    }

    // TLS ends at the Container Apps ingress, so the app sees plain http plus X-Forwarded-Proto. Outside Development it must
    // treat that as https, or Secure cookies and antiforgery refuse every write. HSTS is the observable sign that it did.
    [Fact]
    public async Task Behind_the_ingress_a_forwarded_https_request_counts_as_https()
    {
        await using var production = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
            .UseEnvironment("Production")
            .UseSetting("ConnectionStrings:Budget", "Server=127.0.0.1,1;Database=none;User Id=none;Password=none;Connect Timeout=1;Encrypt=false"));
        var options = new WebApplicationFactoryClientOptions { BaseAddress = new Uri("http://budget.example") };
        var forwarded = production.CreateClient(options);
        forwarded.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https");

        (await forwarded.GetAsync("/health")).Headers.GetValues("Strict-Transport-Security").Single().Should().Be("max-age=2592000");
        (await production.CreateClient(options).GetAsync("/health")).Headers.Contains("Strict-Transport-Security").Should().BeFalse();
    }

    internal static async Task<JsonElement> ShouldBeProblem(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        response.StatusCode.Should().Be(status);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("status").GetInt32().Should().Be((int)status);
        problem.GetProperty("code").GetString().Should().Be(code);
        return problem;
    }
}
