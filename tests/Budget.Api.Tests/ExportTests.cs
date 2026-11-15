using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.Json;
using Budget.Domain;
using Microsoft.AspNetCore.Hosting;

namespace Budget.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class ExportTests(ApiFactory api)
{
    private static DateOnly SydneyToday() => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Australia/Sydney"));

    [Fact]
    public async Task The_export_is_a_zip_download_named_for_today_with_every_file()
    {
        var user = await api.NewUserAsync(email: "export@example.com");
        var cycle = new Cycle(user.Id, SydneyToday().AddDays(-3));
        cycle.Confirm();
        var category = new Category(user.Id, CategoryType.Debit, DateTimeOffset.UtcNow);
        await api.SeedAsync(
            user,
            cycle,
            category,
            new CycleCategory(cycle, category.Id, "Food, drink", "utensils", "blue", 0, 400m),
            new Transaction(cycle, category.Id, -2.5m, cycle.StartDate, "=cmd", Guid.NewGuid(), DateTimeOffset.UtcNow));

        var response = await api.ClientFor(user).GetAsync("/api/me/export");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/zip");
        response.Content.Headers.GetValues("Content-Disposition").Single()
            .Should().Be($"attachment; filename=\"tightarse-export-{SydneyToday():yyyy-MM-dd}.zip\"");
        response.Headers.CacheControl!.NoStore.Should().BeTrue();

        var files = await ExportZip.ReadAsync(response);
        files.Keys.Should().BeEquivalentTo("profile.csv", "cycles.csv", "categories.csv", "transactions.csv", "export.json");
        files["categories.csv"].Should().Contain($"{cycle.StartDate:yyyy-MM-dd},\"Food, drink\",Debit,400.00,");
        // The stored decimal(18,2) comes back as -2.50: the amount is a plain number, the note is guarded.
        files["transactions.csv"].Should().Contain(",\"Food, drink\",Debit,-2.50,'=cmd,");
        files["profile.csv"].Should().Contain("export@example.com");
        using var json = JsonDocument.Parse(files["export.json"]);
        json.RootElement.GetProperty("cycles")[0].GetProperty("id").GetGuid().Should().Be(cycle.Id);
    }

    [Fact]
    public async Task The_demo_user_can_export()
    {
        var demo = await api.NewUserAsync(isDemo: true);

        var response = await api.ClientFor(demo).GetAsync("/api/me/export");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        using var json = JsonDocument.Parse((await ExportZip.ReadAsync(response))["export.json"]);
        json.RootElement.GetProperty("profile").GetProperty("isDemo").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Anonymous_callers_are_refused()
    {
        var response = await api.CreateClient().GetAsync("/api/me/export");

        await HostTests.ShouldBeProblem(response, HttpStatusCode.Unauthorized, "http.401");
    }

    [Fact]
    public async Task The_export_has_its_own_small_rate_limit()
    {
        var user = await api.NewUserAsync();
        await using var strict = api.WithWebHostBuilder(b => b.UseSetting("RateLimiting:ExportPermitLimit", "2"));
        var client = strict.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuth.Header, user.Id.ToString());

        (await client.GetAsync("/api/me/export")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await client.GetAsync("/api/me/export")).StatusCode.Should().Be(HttpStatusCode.OK);
        var rejected = await client.GetAsync("/api/me/export");

        await HostTests.ShouldBeProblem(rejected, HttpStatusCode.TooManyRequests, "rate-limited");
        (await client.GetAsync("/api/me")).StatusCode.Should().Be(HttpStatusCode.OK, "the rest of the API keeps the global limit");
    }
}

internal static class ExportZip
{
    // Every entry as text. The CSVs' byte order mark is dropped.
    public static async Task<Dictionary<string, string>> ReadAsync(HttpResponseMessage response)
    {
        using var buffer = new MemoryStream(await response.Content.ReadAsByteArrayAsync());
        using var zip = new ZipArchive(buffer, ZipArchiveMode.Read);
        return zip.Entries.ToDictionary(e => e.FullName, e =>
        {
            using var reader = new StreamReader(e.Open(), Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
            return reader.ReadToEnd();
        });
    }
}
