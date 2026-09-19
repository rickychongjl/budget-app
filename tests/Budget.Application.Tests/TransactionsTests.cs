using Budget.Domain;
using FluentValidation;

namespace Budget.Application.Tests;

public sealed class TransactionsTests
{
    private static readonly DateTimeOffset Now = new(2026, 2, 10, 1, 0, 0, TimeSpan.Zero);
    private readonly FakeStore _store = new();
    private FixedClock _clock = new(Now);

    private Transactions Sut() => new(_store, _store, _store, new CycleFinder(_store, new UserToday(_store, _store, _clock)), new DemoCaps(_store, _store, _store, _store), _clock);

    // 10 Feb 2026 in Sydney: past (1 Jan), current (31 Jan) and future (2 Mar), each with the same Groceries category.
    private (Cycle Past, Cycle Current, Cycle Future, Guid CategoryId) Chain()
    {
        var past = new Cycle(_store.SignIn().Id, new DateOnly(2026, 1, 1));
        past.Confirm();
        var current = past.CreateNext();
        var future = current.CreateNext();
        _store.Cycles.AddRange([past, current, future]);

        var category = new Category(past.UserId, CategoryType.Debit, Now);
        _store.Categories.Add(category);
        _store.CycleCategories.AddRange(new[] { past, current, future }.Select(c => new CycleCategory(c, category.Id, "Groceries", "shopping-cart", "blue", 0, 600m)));
        return (past, current, future, category.Id);
    }

    private static CreateTransactionRequest Request(Cycle cycle, Guid categoryId, decimal amount = 12.5m, string? note = "milk") =>
        new(Guid.NewGuid(), cycle.Id, categoryId, amount, new DateOnly(2026, 2, 9), note);

    [Fact]
    public async Task Create_adds_the_transaction_to_the_cycle_it_names()
    {
        var chain = Chain();
        var request = Request(chain.Current, chain.CategoryId);

        var result = await Sut().CreateAsync(request);

        var saved = _store.Transactions.Should().ContainSingle().Subject;
        result.Created.Should().BeTrue();
        result.RequiresClosingBalanceReview.Should().BeFalse();
        result.Transaction.Should().Be(new TransactionDto(saved.Id, request.ClientId, chain.Current.Id, chain.CategoryId, 12.5m, new DateOnly(2026, 2, 9), "milk", Now, Now));
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task Replaying_a_create_returns_the_original_and_writes_nothing()
    {
        var chain = Chain();
        var request = Request(chain.Current, chain.CategoryId);
        var first = await Sut().CreateAsync(request);

        var replay = await Sut().CreateAsync(request with { Amount = 999m });

        replay.Created.Should().BeFalse();
        replay.Transaction.Should().Be(first.Transaction);
        _store.Transactions.Should().ContainSingle();
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task Losing_the_client_id_race_returns_the_row_that_won()
    {
        var chain = Chain();
        _store.FailNextSave = new ConflictException("conflict", "duplicate");

        var result = await Sut().CreateAsync(Request(chain.Current, chain.CategoryId));

        result.Created.Should().BeFalse();
    }

    [Fact]
    public async Task Writes_in_a_past_cycle_are_allowed_and_flagged()
    {
        var chain = Chain();
        var sut = Sut();

        var created = await sut.CreateAsync(Request(chain.Past, chain.CategoryId));
        var edited = await sut.EditAsync(created.Transaction.Id, new EditTransactionRequest(null, 20m, null, null));
        var deleted = await sut.DeleteAsync(created.Transaction.Id);

        created.RequiresClosingBalanceReview.Should().BeTrue();
        edited.RequiresClosingBalanceReview.Should().BeTrue();
        deleted.RequiresClosingBalanceReview.Should().BeTrue();
    }

    [Fact]
    public async Task A_draft_or_future_cycle_takes_no_transactions()
    {
        var chain = Chain();
        var sut = Sut();
        (await sut.Invoking(s => s.CreateAsync(Request(chain.Future, chain.CategoryId))).Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("cycle.future.readonly");

        var draft = new Cycle(_store.SignIn().Id, new DateOnly(2026, 2, 1));
        _store.Cycles.Add(draft);
        (await Sut().Invoking(s => s.CreateAsync(Request(draft, chain.CategoryId))).Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("cycle.draft");
    }

    [Fact]
    public async Task The_category_must_be_in_the_cycle_and_the_amount_cannot_be_zero()
    {
        var chain = Chain();
        var sut = Sut();

        (await sut.Invoking(s => s.CreateAsync(Request(chain.Current, Guid.NewGuid()))).Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("category.not-found");
        (await sut.Invoking(s => s.CreateAsync(Request(chain.Current, chain.CategoryId, amount: 0m))).Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("money.zero");
        (await sut.Invoking(s => s.CreateAsync(Request(chain.Current, chain.CategoryId) with { CycleId = Guid.NewGuid() })).Should().ThrowAsync<NotFoundException>())
            .Which.Code.Should().Be("cycle.not-found");
    }

    [Fact]
    public async Task Create_validates_the_shape()
    {
        var chain = Chain();
        var valid = Request(chain.Current, chain.CategoryId);
        var sut = Sut();

        (await sut.Invoking(s => s.CreateAsync(valid with { ClientId = Guid.Empty })).Should().ThrowAsync<ValidationException>()).Which.Errors.Should().Contain(e => e.PropertyName == "ClientId");
        (await sut.Invoking(s => s.CreateAsync(valid with { OccurredOn = default })).Should().ThrowAsync<ValidationException>()).Which.Errors.Should().Contain(e => e.PropertyName == "OccurredOn");
        (await sut.Invoking(s => s.CreateAsync(valid with { Note = new string('x', 281) })).Should().ThrowAsync<ValidationException>()).Which.Errors.Should().Contain(e => e.PropertyName == "Note");
    }

    [Fact]
    public async Task A_negative_amount_is_a_reversal()
    {
        var chain = Chain();

        var result = await Sut().CreateAsync(Request(chain.Current, chain.CategoryId, amount: -12.5m));

        result.Transaction.Amount.Should().Be(-12.5m);
    }

    [Fact]
    public async Task Edit_changes_only_what_it_is_given_and_an_empty_note_clears_it()
    {
        var chain = Chain();
        var created = await Sut().CreateAsync(Request(chain.Current, chain.CategoryId));
        _clock = new FixedClock(Now.AddHours(1));

        var edited = await Sut().EditAsync(created.Transaction.Id, new EditTransactionRequest(null, 30m, null, ""));

        edited.Transaction.Should().Be(created.Transaction with { Amount = 30m, Note = null, UpdatedAt = Now.AddHours(1) });
    }

    [Fact]
    public async Task Edit_rejects_an_empty_request_a_category_outside_the_cycle_and_an_unknown_id()
    {
        var chain = Chain();
        var created = await Sut().CreateAsync(Request(chain.Current, chain.CategoryId));
        var sut = Sut();

        await sut.Invoking(s => s.EditAsync(created.Transaction.Id, new EditTransactionRequest(null, null, null, null))).Should().ThrowAsync<ValidationException>();
        (await sut.Invoking(s => s.EditAsync(created.Transaction.Id, new EditTransactionRequest(Guid.NewGuid(), null, null, null))).Should().ThrowAsync<NotFoundException>())
            .Which.Code.Should().Be("category.not-found");
        (await sut.Invoking(s => s.EditAsync(Guid.NewGuid(), new EditTransactionRequest(null, 1m, null, null))).Should().ThrowAsync<NotFoundException>())
            .Which.Code.Should().Be("transaction.not-found");
    }

    [Fact]
    public async Task Delete_removes_the_transaction()
    {
        var chain = Chain();
        var created = await Sut().CreateAsync(Request(chain.Current, chain.CategoryId));

        var result = await Sut().DeleteAsync(created.Transaction.Id);

        result.RequiresClosingBalanceReview.Should().BeFalse();
        _store.Transactions.Should().BeEmpty();
        (await Sut().Invoking(s => s.DeleteAsync(created.Transaction.Id)).Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("transaction.not-found");
    }

    [Fact]
    public async Task List_is_for_one_cycle_with_an_optional_category_filter()
    {
        var chain = Chain();
        var other = new Category(chain.Current.UserId, CategoryType.Credit, Now);
        _store.Categories.Add(other);
        _store.CycleCategories.Add(new CycleCategory(chain.Current, other.Id, "Salary", "banknote", "green", 1, 5000m));
        var sut = Sut();
        await sut.CreateAsync(Request(chain.Current, chain.CategoryId));
        await sut.CreateAsync(Request(chain.Current, other.Id));
        await sut.CreateAsync(Request(chain.Past, chain.CategoryId));

        (await sut.ListAsync(chain.Current.Id, null)).Should().HaveCount(2);
        (await sut.ListAsync(chain.Current.Id, other.Id)).Should().ContainSingle().Which.CategoryId.Should().Be(other.Id);
        (await sut.Invoking(s => s.ListAsync(Guid.NewGuid(), null)).Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("cycle.not-found");
    }
}
