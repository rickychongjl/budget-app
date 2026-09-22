using System.Net;
using Microsoft.AspNetCore.Hosting;

namespace Budget.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class RateLimitTests(ApiFactory api)
{
    [Fact]
    public async Task The_limit_trips_with_429_problem_details_and_health_is_never_limited()
    {
        await using var strict = api.WithWebHostBuilder(b => b.UseSetting("RateLimiting:PermitLimit", "3"));
        var client = strict.CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 3; i++)
        {
            statuses.Add((await client.GetAsync("/api/me")).StatusCode);
        }

        var rejected = await client.GetAsync("/api/me");

        statuses.Should().AllBeEquivalentTo(HttpStatusCode.Unauthorized);
        await HostTests.ShouldBeProblem(rejected, HttpStatusCode.TooManyRequests, "rate-limited");
        rejected.Headers.RetryAfter!.Delta.Should().BeGreaterThan(TimeSpan.Zero);
        for (var i = 0; i < 10; i++)
        {
            (await client.GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.OK);
        }
    }

    // Behind Cloudflare every request reaches the app from the ingress, so the address that counts is the one Cloudflare
    // reports, not the connection's.
    [Fact]
    public async Task The_client_address_is_the_one_cloudflare_reports()
    {
        await using var strict = api.WithWebHostBuilder(b => b.UseSetting("RateLimiting:PermitLimit", "2"));
        var phone = strict.CreateClient();
        phone.DefaultRequestHeaders.Add("CF-Connecting-IP", "203.0.113.5");
        var laptop = strict.CreateClient();
        laptop.DefaultRequestHeaders.Add("CF-Connecting-IP", "203.0.113.6");

        await phone.GetAsync("/api/me");
        await phone.GetAsync("/api/me");

        (await phone.GetAsync("/api/me")).StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
        (await laptop.GetAsync("/api/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
