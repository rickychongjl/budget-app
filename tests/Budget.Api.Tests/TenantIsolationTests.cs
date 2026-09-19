using System.Net;
using System.Net.Http.Json;
using Budget.Domain;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Budget.Api.Tests;

// User B aims every route that accepts an id (in the path, the query or the body) at user A's rows.
// The guard test at the bottom fails when a new /api route is added without deciding which list it belongs in.
[Collection(ApiCollection.Name)]
public sealed class TenantIsolationTests(ApiFactory api)
{
    private sealed record Victim(Guid CycleId, Guid CategoryId, Guid TransactionId);

    private static readonly string Today =
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Australia/Sydney")).ToString("yyyy-MM-dd");

    private static readonly Dictionary<string, Func<Victim, HttpRequestMessage>> Attacks = new()
    {
        ["GET /api/cycles/{id:guid}"] = a => new(HttpMethod.Get, $"/api/cycles/{a.CycleId}"),
        ["PATCH /api/cycles/{id:guid}"] = a => Json(HttpMethod.Patch, $"/api/cycles/{a.CycleId}", new { closingBalance = 1m }),
        ["POST /api/cycles/{id:guid}/confirm"] = a => new(HttpMethod.Post, $"/api/cycles/{a.CycleId}/confirm"),
        ["POST /api/cycles/{cycleId:guid}/categories"] = a => Json(HttpMethod.Post, $"/api/cycles/{a.CycleId}/categories",
            new { type = "Debit", name = "Planted", icon = "skull", colour = "red", sortOrder = 9, budgetAmount = 1m }),
        ["PATCH /api/cycles/{cycleId:guid}/categories/{categoryId:guid}"] = a =>
            Json(HttpMethod.Patch, $"/api/cycles/{a.CycleId}/categories/{a.CategoryId}", new { name = "Hacked" }),
        ["DELETE /api/cycles/{cycleId:guid}/categories/{categoryId:guid}"] = a => new(HttpMethod.Delete, $"/api/cycles/{a.CycleId}/categories/{a.CategoryId}"),
        ["GET /api/transactions"] = a => new(HttpMethod.Get, $"/api/transactions?cycleId={a.CycleId}"),
        ["POST /api/transactions"] = a => Json(HttpMethod.Post, "/api/transactions",
            new { clientId = Guid.NewGuid(), cycleId = a.CycleId, categoryId = a.CategoryId, amount = 1m, occurredOn = Today }),
        ["PATCH /api/transactions/{id:guid}"] = a => Json(HttpMethod.Patch, $"/api/transactions/{a.TransactionId}", new { amount = 1m }),
        ["DELETE /api/transactions/{id:guid}"] = a => new(HttpMethod.Delete, $"/api/transactions/{a.TransactionId}"),
    };

    // Routes that take no id at all: they can only ever act on the caller. Their own tests prove they return only the caller's rows.
    private static readonly HashSet<string> TakesNoIds =
    [
        "GET /api/me",
        "PATCH /api/me",
        "GET /api/cycles",
        "POST /api/cycles",
        "GET /api/cycles/current",
        "GET /api/categories",
    ];

    // Takes ids, but answers 200 with a refusal per item rather than 404, so its attack lives in SyncTests.
    private static readonly HashSet<string> AttackedElsewhere = ["POST /api/sync"];

    public static TheoryData<string> AttackedRoutes => [.. Attacks.Keys];

    [Theory]
    [MemberData(nameof(AttackedRoutes))]
    public async Task Another_users_ids_are_404_and_their_data_is_unchanged(string route)
    {
        var (victim, victimClient) = await SeedVictimAsync();
        var before = await SnapshotAsync(victimClient, victim);
        var attacker = api.ClientFor(await api.NewUserAsync());

        var response = await attacker.SendAsync(Attacks[route](victim));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound, route);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        (await SnapshotAsync(victimClient, victim)).Should().Be(before);
    }

    [Fact]
    public void Every_api_route_is_either_attacked_or_known_to_take_no_ids()
    {
        var routes = api.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.RoutePattern.RawText!.StartsWith("/api"))
            .SelectMany(e => e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Select(m => $"{m} {e.RoutePattern.RawText!.TrimEnd('/')}") ?? [])
            .ToList();

        routes.Should().NotBeEmpty();
        routes.Except(Attacks.Keys).Except(TakesNoIds).Except(AttackedElsewhere)
            .Should().BeEmpty("a new /api route needs a cross-user attack here, or a reason it cannot be aimed at another user");
        Attacks.Keys.Concat(TakesNoIds).Concat(AttackedElsewhere).Except(routes).Should().BeEmpty("these entries no longer match a route");
    }

    private async Task<(Victim, HttpClient)> SeedVictimAsync()
    {
        var user = await api.NewUserAsync();
        var cycle = new Cycle(user.Id, DateOnly.Parse(Today).AddDays(-5));
        cycle.Confirm();
        var category = new Category(user.Id, CategoryType.Debit, DateTimeOffset.UtcNow);
        var transaction = new Transaction(cycle, category.Id, 42m, cycle.StartDate, "mine", Guid.NewGuid(), DateTimeOffset.UtcNow);
        await api.SeedAsync(user, cycle, category, new CycleCategory(cycle, category.Id, "Groceries", "shopping-cart", "blue", 0, 600m), transaction);
        return (new Victim(cycle.Id, category.Id, transaction.Id), api.ClientFor(user));
    }

    private static async Task<string> SnapshotAsync(HttpClient client, Victim victim) =>
        await client.GetStringAsync($"/api/cycles/{victim.CycleId}") + await client.GetStringAsync($"/api/transactions?cycleId={victim.CycleId}");

    private static HttpRequestMessage Json(HttpMethod method, string url, object body) => new(method, url) { Content = JsonContent.Create(body) };
}
