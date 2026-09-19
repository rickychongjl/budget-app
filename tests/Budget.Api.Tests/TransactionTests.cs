using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Budget.Domain;

namespace Budget.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class TransactionTests(ApiFactory api)
{
    private static DateOnly Today =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Australia/Sydney"));

    // A past cycle and the current one, both with the same category.
    private async Task<(User User, Cycle Past, Cycle Current, Guid CategoryId, HttpClient Client)> SeedAsync()
    {
        var user = await api.NewUserAsync();
        var past = new Cycle(user.Id, Today.AddDays(-35));
        past.Confirm();
        var current = past.CreateNext();
        var category = new Category(user.Id, CategoryType.Debit, DateTimeOffset.UtcNow);
        await api.SeedAsync(user, past, current, category,
            new CycleCategory(past, category.Id, "Groceries", "shopping-cart", "blue", 0, 600m),
            new CycleCategory(current, category.Id, "Groceries", "shopping-cart", "blue", 0, 600m));
        return (user, past, current, category.Id, api.ClientFor(user));
    }

    private static object Body(Guid cycleId, Guid categoryId, Guid? clientId = null, decimal amount = 12.5m) =>
        new { clientId = clientId ?? Guid.NewGuid(), cycleId, categoryId, amount, occurredOn = Today.ToString("yyyy-MM-dd"), note = "milk" };

    [Fact]
    public async Task Create_is_201_and_the_transaction_counts_towards_the_cycle()
    {
        var a = await SeedAsync();

        var response = await a.Client.PostAsJsonAsync("/api/transactions", Body(a.Current.Id, a.CategoryId));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("requiresClosingBalanceReview").GetBoolean().Should().BeFalse();
        body.GetProperty("transaction").GetProperty("amount").GetDecimal().Should().Be(12.5m);
        response.Headers.Location!.ToString().Should().Be($"/api/transactions/{body.GetProperty("transaction").GetProperty("id").GetGuid()}");
        (await a.Client.GetFromJsonAsync<JsonElement>("/api/cycles/current")).GetProperty("rollup").GetProperty("debitsActual").GetDecimal().Should().Be(12.5m);
    }

    [Fact]
    public async Task Replaying_a_create_is_200_with_the_original_and_no_second_row()
    {
        var a = await SeedAsync();
        var clientId = Guid.NewGuid();
        var first = await (await a.Client.PostAsJsonAsync("/api/transactions", Body(a.Current.Id, a.CategoryId, clientId))).Content.ReadFromJsonAsync<JsonElement>();

        var replay = await a.Client.PostAsJsonAsync("/api/transactions", Body(a.Current.Id, a.CategoryId, clientId, amount: 999m));

        replay.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await replay.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("transaction").GetProperty("id").GetGuid().Should().Be(first.GetProperty("transaction").GetProperty("id").GetGuid());
        body.GetProperty("transaction").GetProperty("amount").GetDecimal().Should().Be(12.5m);
        (await a.Client.GetFromJsonAsync<JsonElement>($"/api/transactions?cycleId={a.Current.Id}")).GetArrayLength().Should().Be(1);
    }

    [Fact]
    public async Task A_past_cycle_write_is_allowed_and_flagged()
    {
        var a = await SeedAsync();

        var response = await a.Client.PostAsJsonAsync("/api/transactions", Body(a.Past.Id, a.CategoryId));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("requiresClosingBalanceReview").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Edit_delete_and_the_category_filter()
    {
        var a = await SeedAsync();
        var created = await (await a.Client.PostAsJsonAsync("/api/transactions", Body(a.Current.Id, a.CategoryId))).Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("transaction").GetProperty("id").GetGuid();

        var edited = await a.Client.PatchAsJsonAsync($"/api/transactions/{id}", new { amount = 30m, note = "" });

        edited.StatusCode.Should().Be(HttpStatusCode.OK);
        var transaction = (await edited.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("transaction");
        transaction.GetProperty("amount").GetDecimal().Should().Be(30m);
        transaction.GetProperty("note").ValueKind.Should().Be(JsonValueKind.Null);
        (await a.Client.GetFromJsonAsync<JsonElement>($"/api/transactions?cycleId={a.Current.Id}&categoryId={a.CategoryId}")).GetArrayLength().Should().Be(1);
        (await a.Client.GetFromJsonAsync<JsonElement>($"/api/transactions?cycleId={a.Current.Id}&categoryId={Guid.NewGuid()}")).GetArrayLength().Should().Be(0);

        var deleted = await a.Client.DeleteAsync($"/api/transactions/{id}");

        deleted.StatusCode.Should().Be(HttpStatusCode.OK);
        (await a.Client.GetFromJsonAsync<JsonElement>($"/api/transactions?cycleId={a.Current.Id}")).GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task Rules_and_shape_errors()
    {
        var a = await SeedAsync();
        var draftUser = await api.NewUserAsync();
        var draft = new Cycle(draftUser.Id, Today);
        await api.SeedAsync(draftUser, draft);

        var zero = await a.Client.PostAsJsonAsync("/api/transactions", Body(a.Current.Id, a.CategoryId, amount: 0m));
        var noClientId = await a.Client.PostAsJsonAsync("/api/transactions", new { cycleId = a.Current.Id, categoryId = a.CategoryId, amount = 1m, occurredOn = Today.ToString("yyyy-MM-dd") });
        var noCycle = await a.Client.GetAsync("/api/transactions");
        var intoDraft = await api.ClientFor(draftUser).PostAsJsonAsync("/api/transactions", Body(draft.Id, a.CategoryId));

        await HostTests.ShouldBeProblem(zero, HttpStatusCode.UnprocessableEntity, "money.zero");
        var problem = await HostTests.ShouldBeProblem(noClientId, HttpStatusCode.BadRequest, "validation");
        problem.GetProperty("errors").GetProperty("clientId").GetArrayLength().Should().BeGreaterThan(0);
        await HostTests.ShouldBeProblem(noCycle, HttpStatusCode.BadRequest, "request.malformed");
        await HostTests.ShouldBeProblem(intoDraft, HttpStatusCode.UnprocessableEntity, "cycle.draft");
    }

    [Fact]
    public async Task Another_users_cycle_category_and_transactions_are_404_and_untouched()
    {
        var a = await SeedAsync();
        var created = await (await a.Client.PostAsJsonAsync("/api/transactions", Body(a.Current.Id, a.CategoryId))).Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("transaction").GetProperty("id").GetGuid();
        var b = await SeedAsync();

        var list = await b.Client.GetAsync($"/api/transactions?cycleId={a.Current.Id}");
        var intoTheirCycle = await b.Client.PostAsJsonAsync("/api/transactions", Body(a.Current.Id, a.CategoryId));
        var withTheirCategory = await b.Client.PostAsJsonAsync("/api/transactions", Body(b.Current.Id, a.CategoryId));
        var patch = await b.Client.PatchAsJsonAsync($"/api/transactions/{id}", new { amount = 1m });
        var delete = await b.Client.DeleteAsync($"/api/transactions/{id}");

        await HostTests.ShouldBeProblem(list, HttpStatusCode.NotFound, "cycle.not-found");
        await HostTests.ShouldBeProblem(intoTheirCycle, HttpStatusCode.NotFound, "cycle.not-found");
        await HostTests.ShouldBeProblem(withTheirCategory, HttpStatusCode.NotFound, "category.not-found");
        await HostTests.ShouldBeProblem(patch, HttpStatusCode.NotFound, "transaction.not-found");
        await HostTests.ShouldBeProblem(delete, HttpStatusCode.NotFound, "transaction.not-found");
        var mine = (await a.Client.GetFromJsonAsync<JsonElement>($"/api/transactions?cycleId={a.Current.Id}")).EnumerateArray().Should().ContainSingle().Subject;
        mine.GetProperty("amount").GetDecimal().Should().Be(12.5m);
    }

    [Fact]
    public async Task The_same_client_id_belongs_to_each_user_separately()
    {
        var a = await SeedAsync();
        var b = await SeedAsync();
        var clientId = Guid.NewGuid();
        await a.Client.PostAsJsonAsync("/api/transactions", Body(a.Current.Id, a.CategoryId, clientId));

        var response = await b.Client.PostAsJsonAsync("/api/transactions", Body(b.Current.Id, b.CategoryId, clientId));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }
}
