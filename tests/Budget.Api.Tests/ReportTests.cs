using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Budget.Domain;

namespace Budget.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class ReportTests(ApiFactory api)
{
    private static DateOnly DaysAgo(int days) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Australia/Sydney")).AddDays(-days);

    private async Task<(User User, Cycle Past, Cycle Current, Category Category)> SeedTwoCyclesAsync()
    {
        var user = await api.NewUserAsync();
        var past = new Cycle(user.Id, DaysAgo(35));
        past.Confirm();
        var current = past.CreateNext();
        var category = new Category(user.Id, CategoryType.Debit, DateTimeOffset.UtcNow);

        await api.SeedAsync(
            user,
            past,
            current,
            category,
            new CycleCategory(past, category.Id, "Groceries", "shopping-cart", "blue", 0, 600m),
            new CycleCategory(current, category.Id, "Groceries", "shopping-cart", "blue", 0, 700m));

        await api.SeedAsync(
            user,
            new Transaction(past, category.Id, 650.50m, past.StartDate, null, Guid.NewGuid(), DateTimeOffset.UtcNow),
            new Transaction(current, category.Id, 20m, current.StartDate, null, Guid.NewGuid(), DateTimeOffset.UtcNow));

        return (user, past, current, category);
    }

    [Fact]
    public async Task Report_is_every_cycle_with_its_rollup_oldest_first()
    {
        var a = await SeedTwoCyclesAsync();

        var report = await api.ClientFor(a.User).GetFromJsonAsync<JsonElement>("/api/reports/cycles");

        var elements = report.EnumerateArray().ToList();
        elements.Should().HaveCount(2);

        var past = elements[0];
        past.GetProperty("cycle").GetProperty("id").GetGuid().Should().Be(a.Past.Id);
        past.GetProperty("cycle").GetProperty("phase").GetString().Should().Be("Past");
        past.GetProperty("rollup").GetProperty("debitsActual").GetDecimal().Should().Be(650.50m);
        past.GetProperty("rollup").GetProperty("debitsBudgeted").GetDecimal().Should().Be(600m);
        past.GetProperty("rollup").GetProperty("categories")[0].GetProperty("status").GetString().Should().Be("Over");

        var current = elements[1];
        current.GetProperty("cycle").GetProperty("id").GetGuid().Should().Be(a.Current.Id);
        current.GetProperty("cycle").GetProperty("phase").GetString().Should().Be("Current");
        current.GetProperty("rollup").GetProperty("debitsActual").GetDecimal().Should().Be(20m);
    }

    // The report and the single-cycle endpoint must never disagree; they are the same record.
    [Fact]
    public async Task Each_element_is_what_the_single_cycle_endpoint_returns()
    {
        var a = await SeedTwoCyclesAsync();
        var client = api.ClientFor(a.User);

        var report = await client.GetFromJsonAsync<JsonElement>("/api/reports/cycles");

        foreach (var element in report.EnumerateArray())
        {
            var id = element.GetProperty("cycle").GetProperty("id").GetGuid();
            var single = await client.GetFromJsonAsync<JsonElement>($"/api/cycles/{id}");
            element.GetRawText().Should().Be(single.GetRawText());
        }
    }

    [Fact]
    public async Task A_user_with_no_cycles_gets_an_empty_report()
    {
        var user = await api.NewUserAsync();

        var report = await api.ClientFor(user).GetFromJsonAsync<JsonElement>("/api/reports/cycles");

        report.EnumerateArray().Should().BeEmpty();
    }

    [Fact]
    public async Task Anonymous_callers_are_refused()
    {
        var response = await api.CreateClient().GetAsync("/api/reports/cycles");

        await HostTests.ShouldBeProblem(response, HttpStatusCode.Unauthorized, "http.401");
    }

    [Fact]
    public async Task One_users_report_never_holds_another_users_cycles()
    {
        var a = await SeedTwoCyclesAsync();
        var b = await SeedTwoCyclesAsync();

        var report = await api.ClientFor(b.User).GetFromJsonAsync<JsonElement>("/api/reports/cycles");

        var ids = report.EnumerateArray().Select(e => e.GetProperty("cycle").GetProperty("id").GetGuid()).ToList();
        ids.Should().BeEquivalentTo([b.Past.Id, b.Current.Id]);
        ids.Should().NotContain(a.Past.Id).And.NotContain(a.Current.Id);
    }
}
