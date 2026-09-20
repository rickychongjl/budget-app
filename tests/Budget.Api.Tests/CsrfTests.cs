using System.Net;
using System.Net.Http.Json;
using Budget.Application;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Budget.Api.Tests;

// Plain clients throughout: nothing here fetches a token on the test's behalf, unlike ClientFor and CsrfClient.
[Collection(ApiCollection.Name)]
public sealed class CsrfTests(ApiFactory api)
{
    private static readonly WebApplicationFactoryClientOptions Https = new() { BaseAddress = new Uri("https://localhost") };
    private static readonly object Rename = new { displayName = "Renamed" };

    private HttpClient PlainClientFor(Budget.Domain.User user)
    {
        var client = api.CreateClient(Https);
        client.DefaultRequestHeaders.Add(TestAuth.Header, user.Id.ToString());
        return client;
    }

    private static async Task<string> FetchTokenAsync(HttpClient client)
    {
        var response = await client.GetAsync("/auth/csrf");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await CsrfHandler.RequestTokenAsync(response))!;
    }

    private static HttpRequestMessage Write(HttpMethod method, string path, string? token, object? body = null)
    {
        var request = new HttpRequestMessage(method, path) { Content = body is null ? null : JsonContent.Create(body) };
        if (token is not null)
        {
            request.Headers.Add(CsrfHandler.Header, token);
        }

        return request;
    }

    [Fact]
    public async Task A_write_without_a_token_is_400_and_changes_nothing()
    {
        var client = PlainClientFor(await api.NewUserAsync());

        var response = await client.SendAsync(Write(HttpMethod.Patch, "/api/me", token: null, Rename));

        await HostTests.ShouldBeProblem(response, HttpStatusCode.BadRequest, "csrf.invalid");
        (await client.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/me")).GetProperty("displayName").GetString().Should().Be("Test");
    }

    [Fact]
    public async Task A_write_with_the_token_goes_through_and_reads_never_need_one()
    {
        var client = PlainClientFor(await api.NewUserAsync());

        var response = await client.SendAsync(Write(HttpMethod.Patch, "/api/me", await FetchTokenAsync(client), Rename));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task The_request_token_is_in_the_body_and_the_only_cookie_is_the_httponly_one()
    {
        var response = await api.CreateClient(Https).GetAsync("/auth/csrf");

        (await CsrfHandler.RequestTokenAsync(response)).Should().NotBeNullOrEmpty();
        var cookie = response.Headers.GetValues("Set-Cookie").Should().ContainSingle().Which.ToLowerInvariant();
        cookie.Should().StartWith("budget.csrf=").And.Contain("httponly").And.Contain("; secure").And.Contain("samesite=strict");
    }

    [Fact]
    public async Task A_token_issued_to_one_user_is_refused_for_another()
    {
        var client = PlainClientFor(await api.NewUserAsync());
        var token = await FetchTokenAsync(client);

        // Same browser, same antiforgery cookie, different signed-in user.
        client.DefaultRequestHeaders.Remove(TestAuth.Header);
        client.DefaultRequestHeaders.Add(TestAuth.Header, (await api.NewUserAsync()).Id.ToString());
        var response = await client.SendAsync(Write(HttpMethod.Patch, "/api/me", token, Rename));

        await HostTests.ShouldBeProblem(response, HttpStatusCode.BadRequest, "csrf.invalid");
    }

    [Fact]
    public async Task An_anonymous_token_signs_in_to_the_demo_and_is_refused_once_signed_in()
    {
        using (var scope = api.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<DemoUser>().EnsureExistsAsync();
        }

        var client = api.CreateClient(Https);

        (await client.SendAsync(Write(HttpMethod.Post, "/auth/demo", token: null))).StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var anonymous = await FetchTokenAsync(client);
        (await client.SendAsync(Write(HttpMethod.Post, "/auth/demo", anonymous))).StatusCode.Should().Be(HttpStatusCode.NoContent);

        await HostTests.ShouldBeProblem(await client.SendAsync(Write(HttpMethod.Post, "/auth/logout", anonymous)), HttpStatusCode.BadRequest, "csrf.invalid");
        (await client.SendAsync(Write(HttpMethod.Post, "/auth/logout", await FetchTokenAsync(client)))).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }
}
