using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Budget.Api.Tests;

// The image carries the built SPA in wwwroot. Here a stub page stands in for it.
[Collection(ApiCollection.Name)]
public sealed class SpaHostTests : IDisposable
{
    private const string Page = "<!doctype html><title>stub spa</title>";

    private readonly ApiFactory _api;
    private readonly string _webRoot = Directory.CreateTempSubdirectory("budget-wwwroot").FullName;
    private readonly WebApplicationFactory<Program> _host;

    public SpaHostTests(ApiFactory api)
    {
        _api = api;
        Directory.CreateDirectory(Path.Combine(_webRoot, "assets"));
        File.WriteAllText(Path.Combine(_webRoot, "index.html"), Page);
        File.WriteAllText(Path.Combine(_webRoot, "assets", "app-abc123.js"), "console.log(1)");
        _host = api.WithWebHostBuilder(b => b.UseWebRoot(_webRoot));
    }

    public void Dispose()
    {
        _host.Dispose();
        Directory.Delete(_webRoot, recursive: true);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/cycles/0b1f6c0e-7c65-4f0e-9d53-0d1c2b3a4e5f")]
    [InlineData("/signin?error=auth.not-allowed")]
    public async Task The_page_answers_the_root_and_any_client_side_route(string path)
    {
        var response = await _host.CreateClient().GetAsync(path);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("text/html");
        (await response.Content.ReadAsStringAsync()).Should().Be(Page);
        // A new deployment must be picked up on the next load; the hashed assets it points at are what gets cached.
        response.Headers.CacheControl!.NoCache.Should().BeTrue();
    }

    [Fact]
    public async Task A_hashed_asset_is_cached_for_good()
    {
        var response = await _host.CreateClient().GetAsync("/assets/app-abc123.js");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Headers.CacheControl!.MaxAge.Should().Be(TimeSpan.FromDays(365));
        response.Headers.CacheControl.Extensions.Should().Contain(e => e.Name == "immutable");
    }

    [Fact]
    public async Task A_missing_asset_is_404_not_the_page()
    {
        var response = await _host.CreateClient().GetAsync("/assets/gone-000000.js");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task An_unknown_api_path_is_never_the_page()
    {
        var anonymous = await _host.CreateClient().GetAsync("/api/nope");
        await HostTests.ShouldBeProblem(anonymous, HttpStatusCode.Unauthorized, "http.401");

        var client = _host.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuth.Header, (await _api.NewUserAsync()).Id.ToString());
        await HostTests.ShouldBeProblem(await client.GetAsync("/api/nope"), HttpStatusCode.NotFound, "http.404");
    }

    [Theory]
    [InlineData("/auth/nope")]
    [InlineData("/health/nope")]
    public async Task An_unknown_server_path_is_404_not_the_page(string path)
    {
        var response = await _host.CreateClient().GetAsync(path);

        await HostTests.ShouldBeProblem(response, HttpStatusCode.NotFound, "http.404");
    }

    [Fact]
    public async Task Only_a_get_falls_back_to_the_page()
    {
        var response = await _host.CreateClient().PostAsync("/cycles", null);

        response.StatusCode.Should().NotBe(HttpStatusCode.OK);
    }
}
