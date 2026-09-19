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

    internal static async Task ShouldBeProblem(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        response.StatusCode.Should().Be(status);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        problem.GetProperty("status").GetInt32().Should().Be((int)status);
        problem.GetProperty("code").GetString().Should().Be(code);
    }
}
