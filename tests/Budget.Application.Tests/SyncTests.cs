using Budget.Domain;
using FluentValidation;

namespace Budget.Application.Tests;

public sealed class SyncTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 10, 1, 0, 0, TimeSpan.Zero);
    private readonly FakeStore _store = new();
    private readonly Cycle _cycle;
    private readonly CycleCategory _groceries;

    public SyncTests()
    {
        _cycle = new Cycle(_store.SignIn().Id, new DateOnly(2026, 1, 1));
        _cycle.Confirm();
        var category = new Category(_cycle.UserId, CategoryType.Debit, Now);
        _groceries = new CycleCategory(_cycle, category.Id, "Groceries", "shopping-cart", "blue", 0, 600m);
        _store.Cycles.Add(_cycle);
        _store.Categories.Add(category);
        _store.CycleCategories.Add(_groceries);
    }

    private Sync Sut()
    {
        var clock = new FixedClock(Now);
        var finder = new CycleFinder(_store, new UserToday(_store, _store, clock));
        var caps = new DemoCaps(_store, _store, _store, _store);
        return new Sync(new Transactions(_store, _store, _store, finder, caps, clock), new CycleCategories(_store, _store, _store, _store, finder, caps, clock), _store);
    }

    private SyncItem Create(Guid clientId, decimal amount = 10m) =>
        new("transaction.create", Create: new CreateTransactionRequest(clientId, _cycle.Id, _groceries.CategoryId, amount, _cycle.StartDate, null));

    private static SyncItem Edit(Guid clientId, decimal amount) => new("transaction.edit", ClientId: clientId, Edit: new EditTransactionRequest(null, amount, null, null));

    private static SyncItem Delete(Guid clientId) => new("transaction.delete", ClientId: clientId);

    [Fact]
    public async Task Items_apply_in_order_and_a_transaction_made_offline_is_edited_and_deleted_by_its_client_id()
    {
        var kept = Guid.NewGuid();
        var dropped = Guid.NewGuid();

        var results = await Sut().ApplyAsync(new SyncRequest([Create(kept), Create(dropped), Edit(kept, 25m), Delete(dropped)]));

        results.Should().OnlyContain(r => r.Ok);
        results.Select(r => r.Index).Should().Equal(0, 1, 2, 3);
        _store.Transactions.Should().ContainSingle().Which.Amount.Should().Be(25m);
        _store.Saves.Should().Be(4);
    }

    [Fact]
    public async Task One_bad_item_is_reported_and_does_not_stop_the_rest()
    {
        var results = await Sut().ApplyAsync(new SyncRequest([Create(Guid.NewGuid(), amount: 0m), Create(Guid.NewGuid())]));

        results[0].Should().BeEquivalentTo(new { Index = 0, Ok = false, Code = "money.zero" });
        results[1].Ok.Should().BeTrue();
        _store.Transactions.Should().ContainSingle();
    }

    [Fact]
    public async Task Replaying_a_whole_batch_changes_nothing_and_reports_no_errors()
    {
        var kept = Guid.NewGuid();
        var dropped = Guid.NewGuid();
        var batch = new SyncRequest([Create(kept), Create(dropped), Edit(kept, 25m), Delete(dropped)]);
        await Sut().ApplyAsync(batch);

        var replay = await Sut().ApplyAsync(batch);

        // The dropped transaction is created again and deleted again: the end state is the same.
        replay.Should().OnlyContain(r => r.Ok);
        _store.Transactions.Should().ContainSingle().Which.Amount.Should().Be(25m);
    }

    [Fact]
    public async Task Deleting_what_is_already_gone_is_not_an_error_but_editing_it_is()
    {
        var results = await Sut().ApplyAsync(new SyncRequest([Delete(Guid.NewGuid()), Edit(Guid.NewGuid(), 5m)]));

        results[0].Ok.Should().BeTrue();
        results[1].Should().BeEquivalentTo(new { Ok = false, Code = "transaction.not-found" });
    }

    [Fact]
    public async Task A_category_edit_syncs_but_adding_or_removing_one_is_online_only()
    {
        var results = await Sut().ApplyAsync(new SyncRequest([
            new SyncItem("category.edit", CycleId: _cycle.Id, CategoryId: _groceries.CategoryId, Category: new EditCategoryRequest(null, null, null, null, 750m)),
            new SyncItem("category.add", CycleId: _cycle.Id),
            new SyncItem("category.remove", CycleId: _cycle.Id, CategoryId: _groceries.CategoryId),
        ]));

        results[0].Ok.Should().BeTrue();
        _groceries.BudgetAmount.Should().Be(750m);
        results[1].Code.Should().Be("sync.online-only");
        results[2].Code.Should().Be("sync.online-only");
        _store.CycleCategories.Should().ContainSingle();
    }

    [Fact]
    public async Task An_unknown_type_or_a_missing_payload_is_reported_per_item()
    {
        var results = await Sut().ApplyAsync(new SyncRequest([
            new SyncItem("transaction.explode"),
            new SyncItem("transaction.create"),
            new SyncItem("transaction.edit", ClientId: Guid.NewGuid()),
            new SyncItem("category.edit", CycleId: _cycle.Id),
        ]));

        results.Select(r => r.Code).Should().Equal("sync.unknown-type", "validation", "validation", "validation");
    }

    [Fact]
    public async Task A_batch_is_bounded()
    {
        var tooMany = new SyncRequest([.. Enumerable.Range(0, 501).Select(_ => Delete(Guid.NewGuid()))]);

        await Sut().Invoking(s => s.ApplyAsync(tooMany)).Should().ThrowAsync<ValidationException>();
        await Sut().Invoking(s => s.ApplyAsync(new SyncRequest(null!))).Should().ThrowAsync<ValidationException>();
    }
}
