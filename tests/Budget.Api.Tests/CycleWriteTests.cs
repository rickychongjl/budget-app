using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Budget.Domain;

namespace Budget.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class CycleWriteTests(ApiFactory api)
{
    private static DateOnly Today =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Australia/Sydney"));

    private static string Iso(DateOnly date) => date.ToString("yyyy-MM-dd");

    [Fact]
    public async Task Onboarding_creates_a_draft_then_confirms_it()
    {
        var client = api.ClientFor(await api.NewUserAsync());

        var created = await client.PostAsJsonAsync("/api/cycles", new { startDate = Iso(Today), openingBalance = 1500.25m });

        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var draft = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = draft.GetProperty("id").GetGuid();
        created.Headers.Location!.ToString().Should().Be($"/api/cycles/{id}");
        draft.GetProperty("status").GetString().Should().Be("Draft");
        draft.GetProperty("openingBalance").GetDecimal().Should().Be(1500.25m);

        var confirmed = await client.PostAsync($"/api/cycles/{id}/confirm", null);

        confirmed.StatusCode.Should().Be(HttpStatusCode.OK);
        (await confirmed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString().Should().Be("Confirmed");
        (await client.GetFromJsonAsync<JsonElement>("/api/cycles/current")).GetProperty("cycle").GetProperty("id").GetGuid().Should().Be(id);
    }

    [Fact]
    public async Task A_second_cycle_cannot_be_created_by_hand()
    {
        var client = api.ClientFor(await api.NewUserAsync());
        await client.PostAsJsonAsync("/api/cycles", new { startDate = Iso(Today) });

        var second = await client.PostAsJsonAsync("/api/cycles", new { startDate = Iso(Today.AddDays(30)) });

        await HostTests.ShouldBeProblem(second, HttpStatusCode.UnprocessableEntity, "cycle.exists");
    }

    [Fact]
    public async Task A_request_with_the_wrong_shape_is_400_with_the_failing_fields()
    {
        var client = api.ClientFor(await api.NewUserAsync());

        var response = await client.PostAsJsonAsync("/api/cycles", new { openingBalance = 10m });

        var problem = await HostTests.ShouldBeProblem(response, HttpStatusCode.BadRequest, "validation");
        problem.GetProperty("errors").GetProperty("startDate").GetArrayLength().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task A_body_that_is_not_json_is_400_problem_details()
    {
        var client = api.ClientFor(await api.NewUserAsync());

        var response = await client.PostAsync("/api/cycles", new StringContent("{ nope", Encoding.UTF8, "application/json"));

        await HostTests.ShouldBeProblem(response, HttpStatusCode.BadRequest, "request.malformed");
    }

    [Fact]
    public async Task Patch_sets_balances_and_a_money_rule_is_422()
    {
        var client = api.ClientFor(await api.NewUserAsync());
        var draft = await (await client.PostAsJsonAsync("/api/cycles", new { startDate = Iso(Today) })).Content.ReadFromJsonAsync<JsonElement>();
        var url = $"/api/cycles/{draft.GetProperty("id").GetGuid()}";

        var ok = await client.PatchAsJsonAsync(url, new { openingBalance = 100m, closingBalance = 250.5m });
        var tooPrecise = await client.PatchAsJsonAsync(url, new { closingBalance = 1.234m });

        ok.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await ok.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("openingBalance").GetDecimal().Should().Be(100m);
        body.GetProperty("closingBalance").GetDecimal().Should().Be(250.5m);
        await HostTests.ShouldBeProblem(tooPrecise, HttpStatusCode.UnprocessableEntity, "money.scale");
    }

    [Fact]
    public async Task A_past_cycles_start_date_is_read_only()
    {
        var user = await api.NewUserAsync();
        var past = new Cycle(user.Id, Today.AddDays(-45));
        past.Confirm();
        await api.SeedAsync(user, past, past.CreateNext());

        var response = await api.ClientFor(user).PatchAsJsonAsync($"/api/cycles/{past.Id}", new { startDate = Iso(Today.AddDays(-44)) });

        await HostTests.ShouldBeProblem(response, HttpStatusCode.UnprocessableEntity, "cycle.past.readonly");
    }

    [Fact]
    public async Task Another_users_cycle_cannot_be_confirmed_or_patched()
    {
        var a = await api.NewUserAsync();
        var draft = new Cycle(a.Id, Today);
        await api.SeedAsync(a, draft);
        var b = api.ClientFor(await api.NewUserAsync());

        var confirm = await b.PostAsync($"/api/cycles/{draft.Id}/confirm", null);
        var patch = await b.PatchAsJsonAsync($"/api/cycles/{draft.Id}", new { openingBalance = 1m });

        await HostTests.ShouldBeProblem(confirm, HttpStatusCode.NotFound, "cycle.not-found");
        await HostTests.ShouldBeProblem(patch, HttpStatusCode.NotFound, "cycle.not-found");
        var mine = (await api.ClientFor(a).GetFromJsonAsync<JsonElement>("/api/cycles"))[0];
        mine.GetProperty("status").GetString().Should().Be("Draft");
        mine.GetProperty("openingBalance").ValueKind.Should().Be(JsonValueKind.Null);
    }
}
