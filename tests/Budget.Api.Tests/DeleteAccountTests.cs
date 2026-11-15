using System.Net;
using System.Net.Http.Json;
using Budget.Domain;
using Budget.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Budget.Api.Tests;

// DELETE /api/me through the real pipeline: antiforgery, the typed confirmation, the status codes and the session cookie.
// Signing in again afterwards is in GoogleSignInTests; that it only ever deletes the caller is in TenantIsolationTests.
[Collection(ApiCollection.Name)]
public sealed class DeleteAccountTests(ApiFactory api)
{
    private static readonly string Today =
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Australia/Sydney")).ToString("yyyy-MM-dd");

    internal static HttpRequestMessage Delete(object? body) =>
        new(HttpMethod.Delete, "/api/me") { Content = body is null ? null : JsonContent.Create(body) };

    internal static readonly object Confirmed = new { confirm = "DELETE" };

    private async Task<User> UserWithDataAsync(bool isDemo = false)
    {
        var user = await api.NewUserAsync(isDemo);
        var cycle = new Cycle(user.Id, DateOnly.Parse(Today).AddDays(-3));
        cycle.Confirm();
        var category = new Category(user.Id, CategoryType.Debit, DateTimeOffset.UtcNow);
        await api.SeedAsync(user, cycle, category, new CycleCategory(cycle, category.Id, "Groceries", "shopping-cart", "blue", 0, 600m),
            new Transaction(cycle, category.Id, 9m, cycle.StartDate, null, Guid.NewGuid(), DateTimeOffset.UtcNow),
            new Subscription(user.Id, SubscriptionSource.Manual, null, SubscriptionStatus.Active, null, null, DateTimeOffset.UtcNow));
        return user;
    }

    private async Task<bool> ExistsAsync(User user)
    {
        using var scope = api.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<BudgetDbContext>().Users.AnyAsync(u => u.Id == user.Id);
    }

    // The cookie handler clears budget.session by setting it empty with an expiry in 1970.
    internal static void ShouldClearTheSession(HttpResponseMessage response)
    {
        response.Headers.TryGetValues("Set-Cookie", out var cookies);
        var session = (cookies ?? []).Should().ContainSingle(c => c.StartsWith("budget.session=", StringComparison.Ordinal)).Which.ToLowerInvariant();
        session.Should().StartWith("budget.session=;").And.Contain("expires=thu, 01 jan 1970");
    }

    private static void ShouldKeepTheSession(HttpResponseMessage response)
    {
        response.Headers.TryGetValues("Set-Cookie", out var cookies);
        (cookies ?? []).Should().NotContain(c => c.StartsWith("budget.session=", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Deleting_with_the_typed_confirmation_is_204_removes_everything_and_ends_the_session()
    {
        var user = await UserWithDataAsync();
        var client = api.ClientFor(user);

        var response = await client.SendAsync(Delete(Confirmed));

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        ShouldClearTheSession(response);
        (await ExistsAsync(user)).Should().BeFalse();
        using var scope = api.Services.CreateScope();
        var options = scope.ServiceProvider.GetRequiredService<DbContextOptions<BudgetDbContext>>();
        await using var asUser = new BudgetDbContext(options, new AsUser(user.Id));
        (await asUser.Cycles.AnyAsync()).Should().BeFalse();
        (await asUser.Transactions.AnyAsync()).Should().BeFalse();
        (await asUser.Subscriptions.AnyAsync()).Should().BeFalse();
    }

    [Theory]
    [InlineData("delete")]
    [InlineData("yes")]
    [InlineData("")]
    public async Task A_wrong_word_is_422_and_nothing_is_deleted(string confirm)
    {
        var user = await UserWithDataAsync();

        var response = await api.ClientFor(user).SendAsync(Delete(new { confirm }));

        await HostTests.ShouldBeProblem(response, HttpStatusCode.UnprocessableEntity, "account.delete.unconfirmed");
        ShouldKeepTheSession(response);
        (await ExistsAsync(user)).Should().BeTrue();
    }

    [Fact]
    public async Task No_confirmation_at_all_is_422_too()
    {
        var user = await UserWithDataAsync();
        var client = api.ClientFor(user);

        var emptyObject = await client.SendAsync(Delete(new { }));
        var noBody = await client.SendAsync(Delete(null));

        await HostTests.ShouldBeProblem(emptyObject, HttpStatusCode.UnprocessableEntity, "account.delete.unconfirmed");
        await HostTests.ShouldBeProblem(noBody, HttpStatusCode.UnprocessableEntity, "account.delete.unconfirmed");
        (await ExistsAsync(user)).Should().BeTrue();
    }

    [Fact]
    public async Task The_demo_cannot_be_deleted_and_keeps_its_session()
    {
        var demo = await UserWithDataAsync(isDemo: true);

        var response = await api.ClientFor(demo).SendAsync(Delete(Confirmed));

        await HostTests.ShouldBeProblem(response, HttpStatusCode.UnprocessableEntity, "demo.account.undeletable");
        ShouldKeepTheSession(response);
        (await ExistsAsync(demo)).Should().BeTrue();
    }

    // A retry after the first answer was lost, or a second device: the account is already gone, so the caller just ends
    // up signed out.
    [Fact]
    public async Task Deleting_again_once_it_is_gone_is_204_and_still_ends_the_session()
    {
        var user = await UserWithDataAsync();
        var client = api.ClientFor(user);
        (await client.SendAsync(Delete(Confirmed))).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var again = await client.SendAsync(Delete(Confirmed));

        again.StatusCode.Should().Be(HttpStatusCode.NoContent);
        ShouldClearTheSession(again);
    }

    [Fact]
    public async Task Without_the_antiforgery_token_it_is_400_and_nothing_is_deleted()
    {
        var user = await UserWithDataAsync();
        var client = api.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Add(TestAuth.Header, user.Id.ToString());

        var response = await client.SendAsync(Delete(Confirmed));

        await HostTests.ShouldBeProblem(response, HttpStatusCode.BadRequest, "csrf.invalid");
        (await ExistsAsync(user)).Should().BeTrue();
    }

    [Fact]
    public async Task Signed_out_it_is_401()
    {
        var response = await api.CsrfClient().SendAsync(Delete(Confirmed));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private sealed record AsUser(Guid Id) : Budget.Application.ICurrentUser;
}
