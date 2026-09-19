using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Budget.Domain;

namespace Budget.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class MeTests(ApiFactory api)
{
    [Fact]
    public async Task Patch_updates_the_profile_and_only_mine()
    {
        var other = api.ClientFor(await api.NewUserAsync());
        var client = api.ClientFor(await api.NewUserAsync());

        var response = await client.PatchAsJsonAsync("/api/me", new { displayName = "Ricky", timeZone = "Europe/London" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var me = await client.GetFromJsonAsync<JsonElement>("/api/me");
        me.GetProperty("displayName").GetString().Should().Be("Ricky");
        me.GetProperty("timeZone").GetString().Should().Be("Europe/London");
        (await other.GetFromJsonAsync<JsonElement>("/api/me")).GetProperty("displayName").GetString().Should().Be("Test");
    }

    [Fact]
    public async Task An_unknown_time_zone_is_422_and_an_empty_patch_is_400()
    {
        var client = api.ClientFor(await api.NewUserAsync());

        var unknown = await client.PatchAsJsonAsync("/api/me", new { timeZone = "Mars/Olympus_Mons" });
        var empty = await client.PatchAsJsonAsync("/api/me", new { });

        await HostTests.ShouldBeProblem(unknown, HttpStatusCode.UnprocessableEntity, "user.timezone.unknown");
        await HostTests.ShouldBeProblem(empty, HttpStatusCode.BadRequest, "validation");
    }

    [Fact]
    public async Task The_demo_user_is_capped_through_the_real_pipeline()
    {
        var demo = await api.NewUserAsync(isDemo: true);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Australia/Sydney"));
        var cycle = new Cycle(demo.Id, today);
        cycle.Confirm();
        var category = new Category(demo.Id, CategoryType.Debit, DateTimeOffset.UtcNow);
        await api.SeedAsync(demo, cycle, category, new CycleCategory(cycle, category.Id, "Groceries", "shopping-cart", "blue", 0, 600m));
        var client = api.ClientFor(demo);

        var longNote = await client.PostAsJsonAsync("/api/transactions",
            new { clientId = Guid.NewGuid(), cycleId = cycle.Id, categoryId = category.Id, amount = 5m, occurredOn = today.ToString("yyyy-MM-dd"), note = new string('x', 201) });
        var rename = await client.PatchAsJsonAsync("/api/me", new { displayName = "Someone rude" });

        (await client.GetFromJsonAsync<JsonElement>("/api/me")).GetProperty("isDemo").GetBoolean().Should().BeTrue();
        await HostTests.ShouldBeProblem(longNote, HttpStatusCode.UnprocessableEntity, "demo.cap.note");
        await HostTests.ShouldBeProblem(rename, HttpStatusCode.UnprocessableEntity, "demo.profile.readonly");
    }
}
