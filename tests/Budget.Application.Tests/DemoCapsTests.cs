using Budget.Domain;

namespace Budget.Application.Tests;

public sealed class DemoCapsTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 10, 1, 0, 0, TimeSpan.Zero);
    private static readonly AddCategoryRequest NewCategory = new(null, CategoryType.Debit, "Groceries", "shopping-cart", "blue", 0, 600m);
    private readonly FakeStore _store = new();
    private readonly FixedClock _clock = new(Now);

    private CycleFinder Finder() => new(_store, new UserToday(_store, _store, _clock));
    private DemoCaps Caps() => new(_store, _store, _store, _store);
    private CycleCategories Categories() => new(_store, _store, _store, _store, Finder(), Caps(), _clock);
    private Transactions Transactions() => new(_store, _store, _store, Finder(), Caps(), _clock);

    private (Cycle Cycle, Guid CategoryId) Seed(bool isDemo, int categories = 1, int transactions = 0)
    {
        var cycle = new Cycle(_store.SignIn(isDemo: isDemo).Id, new DateOnly(2026, 1, 1));
        cycle.Confirm();
        _store.Cycles.Add(cycle);
        for (var i = 0; i < categories; i++)
        {
            var category = new Category(cycle.UserId, CategoryType.Debit, Now);
            _store.Categories.Add(category);
            _store.CycleCategories.Add(new CycleCategory(cycle, category.Id, $"Category {i}", "tag", "blue", i, 100m));
        }

        var categoryId = _store.Categories[0].Id;
        for (var i = 0; i < transactions; i++)
        {
            _store.Transactions.Add(new Transaction(cycle, categoryId, 1m, cycle.StartDate, null, Guid.NewGuid(), Now));
        }

        return (cycle, categoryId);
    }

    private static CreateTransactionRequest Spend(Cycle cycle, Guid categoryId, string? note = null) =>
        new(Guid.NewGuid(), cycle.Id, categoryId, 5m, cycle.StartDate, note);

    [Fact]
    public async Task The_demo_user_stops_at_20_categories()
    {
        var demo = Seed(isDemo: true, categories: 20);

        var add = () => Categories().AddAsync(demo.Cycle.Id, NewCategory);

        (await add.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("demo.cap.categories");
        _store.Categories.Should().HaveCount(20);
    }

    [Fact]
    public async Task Putting_an_existing_category_into_another_cycle_is_not_a_new_category()
    {
        var demo = Seed(isDemo: true, categories: 20);
        var next = demo.Cycle.CreateNext();
        _store.Cycles.Add(next);

        var dto = await Categories().AddAsync(next.Id, NewCategory with { CategoryId = demo.CategoryId, Type = null });

        dto.CategoryId.Should().Be(demo.CategoryId);
    }

    [Fact]
    public async Task The_demo_user_stops_at_500_transactions()
    {
        var demo = Seed(isDemo: true, transactions: 500);

        var create = () => Transactions().CreateAsync(Spend(demo.Cycle, demo.CategoryId));

        (await create.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("demo.cap.transactions");
    }

    [Fact]
    public async Task The_demo_users_notes_stop_at_200_characters_on_create_and_edit()
    {
        var demo = Seed(isDemo: true);
        var ok = await Transactions().CreateAsync(Spend(demo.Cycle, demo.CategoryId, new string('x', 200)));

        var create = () => Transactions().CreateAsync(Spend(demo.Cycle, demo.CategoryId, new string('x', 201)));
        var edit = () => Transactions().EditAsync(ok.Transaction.Id, new EditTransactionRequest(null, null, null, new string('x', 201)));

        (await create.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("demo.cap.note");
        (await edit.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("demo.cap.note");
    }

    [Fact]
    public async Task A_real_user_is_never_capped()
    {
        var real = Seed(isDemo: false, categories: 20, transactions: 500);

        await Categories().AddAsync(real.Cycle.Id, NewCategory);
        var result = await Transactions().CreateAsync(Spend(real.Cycle, real.CategoryId, new string('x', 280)));

        _store.Categories.Should().HaveCount(21);
        result.Created.Should().BeTrue();
    }
}
