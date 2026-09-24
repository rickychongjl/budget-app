using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Budget.Domain;

namespace Budget.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class CategoryTests(ApiFactory api)
{
    private static readonly object Groceries = new { type = "Debit", name = "Groceries", icon = "shopping-cart", colour = "blue", sortOrder = 0, budgetAmount = 600m };

    private async Task<(User User, Cycle Cycle, HttpClient Client)> CurrentCycleAsync()
    {
        var user = await api.NewUserAsync();
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Australia/Sydney"));
        var cycle = new Cycle(user.Id, today.AddDays(-5));
        cycle.Confirm();
        await api.SeedAsync(user, cycle);
        return (user, cycle, api.ClientFor(user));
    }

    private static async Task<Guid> AddAsync(HttpClient client, Cycle cycle)
    {
        var response = await client.PostAsJsonAsync($"/api/cycles/{cycle.Id}/categories", Groceries);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("categoryId").GetGuid();
    }

    [Fact]
    public async Task A_new_category_shows_up_in_the_cycle_and_in_the_identities()
    {
        var a = await CurrentCycleAsync();

        var categoryId = await AddAsync(a.Client, a.Cycle);

        var line = (await a.Client.GetFromJsonAsync<JsonElement>($"/api/cycles/{a.Cycle.Id}")).GetProperty("rollup").GetProperty("categories")[0];
        line.GetProperty("categoryId").GetGuid().Should().Be(categoryId);
        line.GetProperty("budgeted").GetDecimal().Should().Be(600m);
        var identity = (await a.Client.GetFromJsonAsync<JsonElement>("/api/categories")).EnumerateArray().Should().ContainSingle().Subject;
        identity.GetProperty("id").GetGuid().Should().Be(categoryId);
        identity.GetProperty("type").GetString().Should().Be("Debit");
        identity.GetProperty("name").GetString().Should().Be("Groceries");
    }

    [Fact]
    public async Task Patch_changes_only_what_it_is_given()
    {
        var a = await CurrentCycleAsync();
        var categoryId = await AddAsync(a.Client, a.Cycle);

        var response = await a.Client.PatchAsJsonAsync($"/api/cycles/{a.Cycle.Id}/categories/{categoryId}", new { budgetAmount = 750m });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("budgetAmount").GetDecimal().Should().Be(750m);
        body.GetProperty("name").GetString().Should().Be("Groceries");
    }

    [Fact]
    public async Task A_category_is_spread_evenly_until_it_is_marked_as_a_bill()
    {
        var a = await CurrentCycleAsync();
        var categoryId = await AddAsync(a.Client, a.Cycle);
        async Task<bool> SpreadEvenlyAsync() =>
            (await a.Client.GetFromJsonAsync<JsonElement>($"/api/cycles/{a.Cycle.Id}")).GetProperty("rollup").GetProperty("categories")[0].GetProperty("spreadEvenly").GetBoolean();

        (await SpreadEvenlyAsync()).Should().BeTrue();

        var response = await a.Client.PatchAsJsonAsync($"/api/cycles/{a.Cycle.Id}/categories/{categoryId}", new { spreadEvenly = false });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("spreadEvenly").GetBoolean().Should().BeFalse();
        (await SpreadEvenlyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Delete_is_204_unless_the_category_has_transactions_in_that_cycle()
    {
        var a = await CurrentCycleAsync();
        var used = await AddAsync(a.Client, a.Cycle);
        var unused = await AddAsync(a.Client, a.Cycle);
        await api.SeedAsync(a.User, new Transaction(a.Cycle, used, 5m, a.Cycle.StartDate, null, Guid.NewGuid(), DateTimeOffset.UtcNow));

        var removed = await a.Client.DeleteAsync($"/api/cycles/{a.Cycle.Id}/categories/{unused}");
        var refused = await a.Client.DeleteAsync($"/api/cycles/{a.Cycle.Id}/categories/{used}");

        removed.StatusCode.Should().Be(HttpStatusCode.NoContent);
        await HostTests.ShouldBeProblem(refused, HttpStatusCode.UnprocessableEntity, "category.has-transactions");
    }

    [Fact]
    public async Task An_invalid_category_is_400_with_the_failing_fields()
    {
        var a = await CurrentCycleAsync();

        var response = await a.Client.PostAsJsonAsync($"/api/cycles/{a.Cycle.Id}/categories", new { name = "", icon = "x", colour = "blue", sortOrder = 0, budgetAmount = 1m });

        var problem = await HostTests.ShouldBeProblem(response, HttpStatusCode.BadRequest, "validation");
        problem.GetProperty("errors").GetProperty("name").GetArrayLength().Should().BeGreaterThan(0);
        problem.GetProperty("errors").GetProperty("type").GetArrayLength().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task Another_users_cycle_and_category_are_404_and_untouched()
    {
        var a = await CurrentCycleAsync();
        var categoryId = await AddAsync(a.Client, a.Cycle);
        var b = await CurrentCycleAsync();

        var add = await b.Client.PostAsJsonAsync($"/api/cycles/{a.Cycle.Id}/categories", Groceries);
        var patch = await b.Client.PatchAsJsonAsync($"/api/cycles/{a.Cycle.Id}/categories/{categoryId}", new { name = "Hacked" });
        var delete = await b.Client.DeleteAsync($"/api/cycles/{a.Cycle.Id}/categories/{categoryId}");
        var borrow = await b.Client.PostAsJsonAsync($"/api/cycles/{b.Cycle.Id}/categories",
            new { categoryId, name = "Borrowed", icon = "x", colour = "blue", sortOrder = 0, budgetAmount = 1m });

        await HostTests.ShouldBeProblem(add, HttpStatusCode.NotFound, "cycle.not-found");
        await HostTests.ShouldBeProblem(patch, HttpStatusCode.NotFound, "cycle.not-found");
        await HostTests.ShouldBeProblem(delete, HttpStatusCode.NotFound, "cycle.not-found");
        await HostTests.ShouldBeProblem(borrow, HttpStatusCode.NotFound, "category.not-found");
        var mine = (await a.Client.GetFromJsonAsync<JsonElement>($"/api/cycles/{a.Cycle.Id}")).GetProperty("rollup").GetProperty("categories");
        mine.EnumerateArray().Should().ContainSingle().Which.GetProperty("name").GetString().Should().Be("Groceries");
        (await b.Client.GetFromJsonAsync<JsonElement>("/api/categories")).GetArrayLength().Should().Be(0);
    }
}
