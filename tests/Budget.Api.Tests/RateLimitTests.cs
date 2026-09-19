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
}
