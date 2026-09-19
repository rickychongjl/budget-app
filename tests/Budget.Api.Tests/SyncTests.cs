using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Budget.Domain;

namespace Budget.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class SyncTests(ApiFactory api)
{
    private static readonly DateOnly Today =
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Australia/Sydney"));

    private async Task<(Cycle Cycle, Guid CategoryId, HttpClient Client)> SeedAsync()
    {
        var user = await api.NewUserAsync();
        var cycle = new Cycle(user.Id, Today.AddDays(-5));
        cycle.Confirm();
        var category = new Category(user.Id, CategoryType.Debit, DateTimeOffset.UtcNow);
        await api.SeedAsync(user, cycle, category, new CycleCategory(cycle, category.Id, "Groceries", "shopping-cart", "blue", 0, 600m));
        return (cycle, category.Id, api.ClientFor(user));
    }

    private static object Create(Guid clientId, Guid cycleId, Guid categoryId, decimal amount) => new
    {
        type = "transaction.create",
        create = new { clientId, cycleId, categoryId, amount, occurredOn = Today.ToString("yyyy-MM-dd") },
    };

    [Fact]
    public async Task A_batch_applies_in_order_reports_each_item_and_can_be_replayed()
    {
        var a = await SeedAsync();
        var kept = Guid.NewGuid();
        var batch = new
        {
            items = new[]
            {
                Create(kept, a.Cycle.Id, a.CategoryId, 10m),
                new { type = "transaction.edit", clientId = kept, edit = new { amount = 25m } },
                Create(Guid.NewGuid(), a.Cycle.Id, a.CategoryId, 0m),
                new { type = "category.edit", cycleId = a.Cycle.Id, categoryId = a.CategoryId, category = new { budgetAmount = 750m } },
                new { type = "category.add", cycleId = a.Cycle.Id },
            },
        };

        var first = await a.Client.PostAsJsonAsync("/api/sync", batch);
        var replay = await a.Client.PostAsJsonAsync("/api/sync", batch);

        first.StatusCode.Should().Be(HttpStatusCode.OK);
        foreach (var response in new[] { first, replay })
        {
            var results = (await response.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToList();
            results.Select(r => r.GetProperty("ok").GetBoolean()).Should().Equal(true, true, false, true, false);
            results[1].GetProperty("result").GetProperty("transaction").GetProperty("amount").GetDecimal().Should().Be(25m);
            results[2].GetProperty("code").GetString().Should().Be("money.zero");
            results[4].GetProperty("code").GetString().Should().Be("sync.online-only");
        }

        var rollup = (await a.Client.GetFromJsonAsync<JsonElement>("/api/cycles/current")).GetProperty("rollup");
        rollup.GetProperty("debitsActual").GetDecimal().Should().Be(25m);
        rollup.GetProperty("debitsBudgeted").GetDecimal().Should().Be(750m);
    }

    [Fact]
    public async Task Another_users_rows_cannot_be_reached_through_a_batch()
    {
        var a = await SeedAsync();
        var theirs = Guid.NewGuid();
        await a.Client.PostAsJsonAsync("/api/sync", new { items = new[] { Create(theirs, a.Cycle.Id, a.CategoryId, 42m) } });
        var b = await SeedAsync();

        var response = await b.Client.PostAsJsonAsync("/api/sync", new
        {
            items = new object[]
            {
                Create(Guid.NewGuid(), a.Cycle.Id, a.CategoryId, 1m),
                Create(Guid.NewGuid(), b.Cycle.Id, a.CategoryId, 1m),
                new { type = "transaction.edit", clientId = theirs, edit = new { amount = 1m } },
                new { type = "transaction.delete", clientId = theirs },
                new { type = "category.edit", cycleId = a.Cycle.Id, categoryId = a.CategoryId, category = new { name = "Hacked" } },
            },
        });

        var results = (await response.Content.ReadFromJsonAsync<JsonElement>()).EnumerateArray().ToList();
        results.Select(r => r.GetProperty("code").GetString()).Should().Equal("cycle.not-found", "category.not-found", "transaction.not-found", null, "cycle.not-found");
        // The delete is "already gone" as far as B can tell. A still has the row.
        var mine = (await a.Client.GetFromJsonAsync<JsonElement>($"/api/transactions?cycleId={a.Cycle.Id}")).EnumerateArray().Should().ContainSingle().Subject;
        mine.GetProperty("amount").GetDecimal().Should().Be(42m);
        (await a.Client.GetFromJsonAsync<JsonElement>("/api/cycles/current")).GetProperty("rollup").GetProperty("categories")[0].GetProperty("name").GetString().Should().Be("Groceries");
    }

    [Fact]
    public async Task A_batch_over_the_limit_is_400()
    {
        var a = await SeedAsync();
        var items = Enumerable.Range(0, 501).Select(_ => new { type = "transaction.delete", clientId = Guid.NewGuid() });

        var response = await a.Client.PostAsJsonAsync("/api/sync", new { items });

        await HostTests.ShouldBeProblem(response, HttpStatusCode.BadRequest, "validation");
    }
}
