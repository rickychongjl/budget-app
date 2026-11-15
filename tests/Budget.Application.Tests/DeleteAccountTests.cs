using Budget.Domain;
using Microsoft.Extensions.Logging;

namespace Budget.Application.Tests;

public sealed class DeleteAccountTests
{
    private static readonly DeleteAccountRequest Confirmed = new("DELETE");

    private readonly FakeStore _store = new();
    private readonly RecordingBilling _billing;
    private readonly ListLogger<DeleteAccount> _log = new();

    public DeleteAccountTests() => _billing = new RecordingBilling(_store.Steps);

    private DeleteAccount Sut() => new(_store, _store, _billing, _log);

    // One of everything, so a step that forgot a table would leave something behind.
    private void SeedFor(User user)
    {
        var cycle = new Cycle(user.Id, new DateOnly(2026, 1, 1));
        cycle.Confirm();
        var category = new Category(user.Id, CategoryType.Debit, DateTimeOffset.UnixEpoch);
        _store.Cycles.Add(cycle);
        _store.Categories.Add(category);
        _store.CycleCategories.Add(new CycleCategory(cycle, category.Id, "Groceries", "shopping-cart", "blue", 0, 600m));
        _store.Transactions.Add(new Transaction(cycle, category.Id, 12m, cycle.StartDate, null, Guid.NewGuid(), DateTimeOffset.UnixEpoch));
        _store.Subscriptions.Add(new Subscription(user.Id, SubscriptionSource.Manual, null, SubscriptionStatus.Active, null, null, DateTimeOffset.UnixEpoch));
    }

    private User Bystander()
    {
        var other = new User("Other", "Australia/Sydney", "AUD", DateTimeOffset.UnixEpoch);
        _store.Users.Add(other);
        SeedFor(other);
        return other;
    }

    [Fact]
    public async Task Cancels_billing_then_deletes_the_data_then_the_user()
    {
        var user = _store.SignIn();
        SeedFor(user);

        var outcome = await Sut().RunAsync(Confirmed);

        outcome.Should().Be(DeleteAccountOutcome.Deleted);
        _store.Steps.Should().Equal($"cancel billing {user.Id}", "delete data", "delete user");
        _store.Users.Should().NotContain(u => u.Id == user.Id);
        _store.Cycles.Should().BeEmpty();
        _store.Categories.Should().BeEmpty();
        _store.CycleCategories.Should().BeEmpty();
        _store.Transactions.Should().BeEmpty();
        _store.Subscriptions.Should().BeEmpty();
    }

    [Fact]
    public async Task Only_the_callers_account_and_rows_go()
    {
        var other = Bystander();
        var user = _store.SignIn();
        SeedFor(user);

        await Sut().RunAsync(Confirmed);

        _store.Users.Should().ContainSingle().Which.Should().BeSameAs(other);
        _store.Cycles.Should().ContainSingle().Which.UserId.Should().Be(other.Id);
        _store.Categories.Should().ContainSingle().Which.UserId.Should().Be(other.Id);
        _store.CycleCategories.Should().ContainSingle().Which.UserId.Should().Be(other.Id);
        _store.Transactions.Should().ContainSingle().Which.UserId.Should().Be(other.Id);
        _store.Subscriptions.Should().ContainSingle().Which.UserId.Should().Be(other.Id);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("delete")]
    [InlineData("Delete")]
    [InlineData("DELETE ME")]
    [InlineData("yes")]
    public async Task Anything_but_the_typed_confirmation_is_refused_and_nothing_happens(string? confirm)
    {
        var user = _store.SignIn();
        SeedFor(user);

        var run = () => Sut().RunAsync(new DeleteAccountRequest(confirm));

        (await run.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("account.delete.unconfirmed");
        _store.Steps.Should().BeEmpty();
        _store.Users.Should().Contain(user);
        _store.Transactions.Should().ContainSingle();
    }

    [Fact]
    public async Task A_missing_body_is_refused_like_a_wrong_word()
    {
        _store.SignIn();

        (await Sut().Invoking(s => s.RunAsync(null)).Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("account.delete.unconfirmed");
        _store.Steps.Should().BeEmpty();
    }

    // A phone keyboard can add a trailing space after the word.
    [Fact]
    public async Task Spaces_around_the_word_are_forgiven()
    {
        _store.SignIn();

        (await Sut().RunAsync(new DeleteAccountRequest(" DELETE "))).Should().Be(DeleteAccountOutcome.Deleted);
    }

    [Fact]
    public async Task The_shared_demo_cannot_be_deleted_and_billing_is_not_touched()
    {
        var demo = _store.SignIn(isDemo: true);
        SeedFor(demo);

        var run = () => Sut().RunAsync(Confirmed);

        (await run.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("demo.account.undeletable");
        _store.Steps.Should().BeEmpty();
        _store.Users.Should().Contain(demo);
        _store.Cycles.Should().ContainSingle();
    }

    [Fact]
    public async Task Asking_again_once_it_is_gone_is_not_an_error_and_does_nothing_more()
    {
        _store.SignIn();
        await Sut().RunAsync(Confirmed);
        _store.Steps.Clear();

        var again = await Sut().RunAsync(Confirmed);

        again.Should().Be(DeleteAccountOutcome.AlreadyGone);
        _store.Steps.Should().BeEmpty();
    }

    [Fact]
    public async Task A_billing_failure_deletes_nothing_and_a_retry_finishes_the_job()
    {
        var user = _store.SignIn();
        SeedFor(user);
        _billing.FailNext = new HttpRequestException("store unreachable");

        await Sut().Invoking(s => s.RunAsync(Confirmed)).Should().ThrowAsync<HttpRequestException>();

        _store.Users.Should().Contain(user);
        _store.Transactions.Should().ContainSingle();

        (await Sut().RunAsync(Confirmed)).Should().Be(DeleteAccountOutcome.Deleted);
        _store.Users.Should().BeEmpty();
        _store.Transactions.Should().BeEmpty();
    }

    // The delete is one transaction, so a failure there leaves the account whole. The retry cancels billing again, which
    // the port promises is safe, and then finishes.
    [Fact]
    public async Task A_failed_delete_leaves_the_account_whole_and_a_retry_finishes_the_job()
    {
        var user = _store.SignIn();
        SeedFor(user);
        _store.FailNextAccountDelete = new TimeoutException("database went away");

        await Sut().Invoking(s => s.RunAsync(Confirmed)).Should().ThrowAsync<TimeoutException>();

        _store.Users.Should().Contain(user);
        _store.Cycles.Should().ContainSingle();

        (await Sut().RunAsync(Confirmed)).Should().Be(DeleteAccountOutcome.Deleted);
        _store.Steps.Should().Equal($"cancel billing {user.Id}", $"cancel billing {user.Id}", "delete data", "delete user");
        _store.Users.Should().BeEmpty();
        _store.Cycles.Should().BeEmpty();
    }

    [Fact]
    public async Task Each_outcome_is_one_log_line_with_no_identifiers()
    {
        var user = _store.SignIn();
        await Sut().RunAsync(Confirmed);
        await Sut().RunAsync(Confirmed);
        var demo = _store.SignIn(isDemo: true);
        await Sut().Invoking(s => s.RunAsync(Confirmed)).Should().ThrowAsync<DomainException>();

        _log.Entries.Should().HaveCount(3);
        _log.Entries.Should().OnlyContain(e => e.Level == LogLevel.Information);
        _log.Entries.Select(e => e.Message).Should().NotContain(m => m.Contains(user.Id.ToString()) || m.Contains(demo.Id.ToString()) || m.Contains("Test"));
    }

    private sealed class RecordingBilling(List<string> steps) : IBilling
    {
        public Exception? FailNext { get; set; }

        public Task CancelForDeletionAsync(Guid userId, CancellationToken ct = default)
        {
            if (FailNext is { } failure)
            {
                FailNext = null;
                throw failure;
            }

            steps.Add($"cancel billing {userId}");
            return Task.CompletedTask;
        }
    }
}
