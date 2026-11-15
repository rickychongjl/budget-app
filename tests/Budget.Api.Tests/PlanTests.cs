using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Budget.Domain;

namespace Budget.Api.Tests;

// Plans through the real pipeline: what GET /api/me reports, the refusal's problem shape, and the trimmed report.
[Collection(ApiCollection.Name)]
public sealed class PlanTests(ApiFactory api)
{
    private static DateOnly DaysAgo(int days) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Australia/Sydney")).AddDays(-days);

    private static object NewCategory(int i) => new { type = "Debit", name = $"Category {i}", icon = "tag", colour = "blue", sortOrder = i, budgetAmount = 10m };

    private async Task<(Cycle Cycle, HttpClient Client)> CurrentCycleWithAsync(User user, int categories)
    {
        var cycle = new Cycle(user.Id, DaysAgo(5));
        cycle.Confirm();
        var rows = new List<object> { cycle };
        for (var i = 0; i < categories; i++)
        {
            var category = new Category(user.Id, CategoryType.Debit, DateTimeOffset.UtcNow);
            rows.Add(category);
            rows.Add(new CycleCategory(cycle, category.Id, $"Seeded {i}", "tag", "blue", i, 10m));
        }

        await api.SeedAsync(user, rows.ToArray());
        return (cycle, api.ClientFor(user));
    }

    [Fact]
    public async Task Me_reports_free_and_its_limits_for_a_new_user()
    {
        var me = await api.ClientFor(await api.NewUserAsync()).GetFromJsonAsync<JsonElement>("/api/me");

        me.GetProperty("plan").GetString().Should().Be("free");
        me.GetProperty("planSource").ValueKind.Should().Be(JsonValueKind.Null);
        var limits = me.GetProperty("limits");
        limits.GetProperty("maxCategoriesPerCycle").GetInt32().Should().Be(6);
        limits.GetProperty("pastCyclesInReports").GetInt32().Should().Be(1);
        limits.GetProperty("trendChart").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Me_reports_premium_for_the_demo_a_complimentary_email_and_a_subscription()
    {
        var subscriber = await api.NewUserAsync();
        await api.SeedAsync(subscriber, new Subscription(subscriber.Id, SubscriptionSource.AppStore, "3000000001", SubscriptionStatus.Active, DateTimeOffset.UtcNow.AddDays(20), null, DateTimeOffset.UtcNow));
        var users = new Dictionary<string, User>
        {
            ["demo"] = await api.NewUserAsync(isDemo: true),
            ["complimentary"] = await api.NewUserAsync(externalId: "google:" + Guid.NewGuid().ToString("N"), email: ApiFactory.ComplimentaryEmail.ToUpperInvariant()),
            ["subscription"] = subscriber,
        };

        foreach (var (source, user) in users)
        {
            var me = await api.ClientFor(user).GetFromJsonAsync<JsonElement>("/api/me");
            me.GetProperty("plan").GetString().Should().Be("premium", source);
            me.GetProperty("planSource").GetString().Should().Be(source);
            me.GetProperty("limits").GetProperty("maxCategoriesPerCycle").ValueKind.Should().Be(JsonValueKind.Null);
            me.GetProperty("limits").GetProperty("trendChart").GetBoolean().Should().BeTrue();
        }
    }

    [Fact]
    public async Task A_seventh_category_on_free_is_a_422_problem_and_nothing_is_added()
    {
        var (cycle, client) = await CurrentCycleWithAsync(await api.NewUserAsync(), categories: 6);

        var response = await client.PostAsJsonAsync($"/api/cycles/{cycle.Id}/categories", NewCategory(7));

        var problem = await HostTests.ShouldBeProblem(response, HttpStatusCode.UnprocessableEntity, "plan.limit.categories");
        problem.GetProperty("detail").GetString().Should().Contain("6");
        var rows = (await client.GetFromJsonAsync<JsonElement>($"/api/cycles/{cycle.Id}")).GetProperty("rollup").GetProperty("categories");
        rows.GetArrayLength().Should().Be(6);
    }

    [Fact]
    public async Task Premium_adds_a_seventh_category()
    {
        var user = await api.NewUserAsync();
        await api.SeedAsync(user, new Subscription(user.Id, SubscriptionSource.Manual, null, SubscriptionStatus.Active, null, null, DateTimeOffset.UtcNow));
        var (cycle, client) = await CurrentCycleWithAsync(user, categories: 6);

        var response = await client.PostAsJsonAsync($"/api/cycles/{cycle.Id}/categories", NewCategory(7));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Free_reports_the_most_recent_past_cycle_and_the_current_one()
    {
        var user = await api.NewUserAsync();
        var first = new Cycle(user.Id, DaysAgo(95));
        first.Confirm();
        var second = first.CreateNext();
        var third = second.CreateNext();
        var current = third.CreateNext();
        await api.SeedAsync(user, first, second, third, current);

        var report = await api.ClientFor(user).GetFromJsonAsync<JsonElement>("/api/reports/cycles");

        report.EnumerateArray().Select(e => e.GetProperty("cycle").GetProperty("id").GetGuid()).Should().Equal(third.Id, current.Id);
        (await api.ClientFor(user).GetFromJsonAsync<JsonElement>("/api/cycles")).GetArrayLength().Should().Be(4, "the older cycles are kept");
    }

    [Fact]
    public async Task The_plan_catalogue_is_public_and_matches_the_plans()
    {
        var catalogue = await api.CreateClient().GetFromJsonAsync<JsonElement>("/api/plans");

        catalogue.GetProperty("free").GetProperty("maxCategoriesPerCycle").GetInt32().Should().Be(6);
        catalogue.GetProperty("premium").GetProperty("maxCategoriesPerCycle").ValueKind.Should().Be(JsonValueKind.Null);
        var price = catalogue.GetProperty("premiumPrice");
        price.GetProperty("currency").GetString().Should().Be("AUD");
        price.GetProperty("monthly").GetDecimal().Should().Be(3.99m);
        price.GetProperty("yearly").GetDecimal().Should().Be(29.99m);
        price.GetProperty("trialDays").GetInt32().Should().Be(14);
    }
}
