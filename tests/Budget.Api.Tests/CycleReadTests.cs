using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Budget.Domain;

namespace Budget.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class CycleReadTests(ApiFactory api)
{
    // Test users are in Sydney; a cycle that started this many days ago is current (0 to 29) or over (30+).
    private static DateOnly DaysAgo(int days) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Australia/Sydney")).AddDays(-days);

    private async Task<(User User, Cycle Cycle, Category Category)> SeedAsync(int startedDaysAgo)
    {
        var user = await api.NewUserAsync();
        var cycle = new Cycle(user.Id, DaysAgo(startedDaysAgo));
        cycle.Confirm();
        var category = new Category(user.Id, CategoryType.Debit, DateTimeOffset.UtcNow);
        await api.SeedAsync(user, cycle, category, new CycleCategory(cycle, category.Id, "Groceries", "shopping-cart", "blue", 0, 600m));
        return (user, cycle, category);
    }

    [Fact]
    public async Task List_returns_the_users_cycles_with_phase_and_dates()
    {
        var a = await SeedAsync(startedDaysAgo: 5);

        var list = await api.ClientFor(a.User).GetFromJsonAsync<JsonElement>("/api/cycles");

        var only = list.EnumerateArray().Should().ContainSingle().Subject;
        only.GetProperty("id").GetGuid().Should().Be(a.Cycle.Id);
        only.GetProperty("startDate").GetString().Should().Be(a.Cycle.StartDate.ToString("yyyy-MM-dd"));
        only.GetProperty("endDate").GetString().Should().Be(a.Cycle.EndDate.ToString("yyyy-MM-dd"));
        only.GetProperty("status").GetString().Should().Be("Confirmed");
        only.GetProperty("phase").GetString().Should().Be("Current");
        only.GetProperty("openingBalance").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public async Task Get_returns_the_rollup()
    {
        var a = await SeedAsync(startedDaysAgo: 5);
        await api.SeedAsync(a.User, new Transaction(a.Cycle, a.Category.Id, 650.50m, a.Cycle.StartDate, null, Guid.NewGuid(), DateTimeOffset.UtcNow));

        var summary = await api.ClientFor(a.User).GetFromJsonAsync<JsonElement>($"/api/cycles/{a.Cycle.Id}");

        summary.GetProperty("cycle").GetProperty("id").GetGuid().Should().Be(a.Cycle.Id);
        var rollup = summary.GetProperty("rollup");
        rollup.GetProperty("debitsBudgeted").GetDecimal().Should().Be(600m);
        rollup.GetProperty("debitsActual").GetDecimal().Should().Be(650.50m);
        var line = rollup.GetProperty("categories")[0];
        line.GetProperty("name").GetString().Should().Be("Groceries");
        line.GetProperty("type").GetString().Should().Be("Debit");
        line.GetProperty("status").GetString().Should().Be("Over");
    }

    [Fact]
    public async Task Current_creates_the_missing_cycle_when_the_job_has_not_run()
    {
        var a = await SeedAsync(startedDaysAgo: 40);
        var client = api.ClientFor(a.User);

        var current = await client.GetFromJsonAsync<JsonElement>("/api/cycles/current");

        current.GetProperty("cycle").GetProperty("startDate").GetString().Should().Be(a.Cycle.StartDate.AddDays(30).ToString("yyyy-MM-dd"));
        current.GetProperty("cycle").GetProperty("phase").GetString().Should().Be("Current");
        current.GetProperty("rollup").GetProperty("categories")[0].GetProperty("budgeted").GetDecimal().Should().Be(600m);
        (await client.GetFromJsonAsync<JsonElement>("/api/cycles")).GetArrayLength().Should().Be(2);
    }

    [Fact]
    public async Task Current_before_onboarding_is_404_cycle_none()
    {
        var response = await api.ClientFor(await api.NewUserAsync()).GetAsync("/api/cycles/current");

        await HostTests.ShouldBeProblem(response, HttpStatusCode.NotFound, "cycle.none");
    }

    [Fact]
    public async Task Another_users_cycle_is_404_and_is_not_listed()
    {
        var a = await SeedAsync(startedDaysAgo: 5);
        var b = api.ClientFor(await api.NewUserAsync());

        var response = await b.GetAsync($"/api/cycles/{a.Cycle.Id}");

        await HostTests.ShouldBeProblem(response, HttpStatusCode.NotFound, "cycle.not-found");
        (await b.GetFromJsonAsync<JsonElement>("/api/cycles")).GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task An_id_that_is_not_a_guid_is_404_problem_details()
    {
        var response = await api.ClientFor(await api.NewUserAsync()).GetAsync("/api/cycles/not-a-guid");

        await HostTests.ShouldBeProblem(response, HttpStatusCode.NotFound, "http.404");
    }
}
