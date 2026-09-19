using Budget.Domain;
using FluentValidation;

namespace Budget.Application.Tests;

public sealed class CycleCategoriesTests
{
    private static readonly DateTimeOffset Now = new(2026, 2, 10, 1, 0, 0, TimeSpan.Zero);
    private static readonly AddCategoryRequest NewGroceries = new(null, CategoryType.Debit, "Groceries", "shopping-cart", "blue", 0, 600m);
    private readonly FakeStore _store = new();

    // 10 Feb 2026 in Sydney: a chain from 1 Jan has a past cycle, a current one (31 Jan) and a future one.
    private CycleCategories Sut()
    {
        var clock = new FixedClock(Now);
        return new CycleCategories(_store, _store, _store, _store, new CycleFinder(_store, new UserToday(_store, _store, clock)), new DemoCaps(_store, _store, _store, _store), clock);
    }

    private (Cycle Past, Cycle Current, Cycle Future) Chain()
    {
        var past = new Cycle(_store.SignIn().Id, new DateOnly(2026, 1, 1));
        past.Confirm();
        var current = past.CreateNext();
        var future = current.CreateNext();
        _store.Cycles.AddRange([past, current, future]);
        return (past, current, future);
    }

    private CycleCategory Existing(Cycle cycle, string name = "Groceries")
    {
        var category = new Category(cycle.UserId, CategoryType.Debit, Now);
        var snapshot = new CycleCategory(cycle, category.Id, name, "shopping-cart", "blue", 0, 600m);
        _store.Categories.Add(category);
        _store.CycleCategories.Add(snapshot);
        return snapshot;
    }

    [Fact]
    public async Task Adding_a_new_category_creates_the_identity_and_the_snapshot()
    {
        var chain = Chain();

        var dto = await Sut().AddAsync(chain.Current.Id, NewGroceries);

        var category = _store.Categories.Should().ContainSingle().Subject;
        category.Type.Should().Be(CategoryType.Debit);
        category.CreatedAt.Should().Be(Now);
        _store.CycleCategories.Should().ContainSingle().Which.CycleId.Should().Be(chain.Current.Id);
        dto.Should().Be(new CycleCategoryDto(category.Id, CategoryType.Debit, "Groceries", "shopping-cart", "blue", 0, 600m));
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task An_existing_category_can_be_added_to_another_cycle_but_only_once()
    {
        var chain = Chain();
        var existing = Existing(chain.Current);
        var request = NewGroceries with { CategoryId = existing.CategoryId, Type = null, BudgetAmount = 700m };

        var dto = await Sut().AddAsync(chain.Future.Id, request);
        var again = () => Sut().AddAsync(chain.Future.Id, request);

        dto.CategoryId.Should().Be(existing.CategoryId);
        dto.Type.Should().Be(CategoryType.Debit);
        _store.Categories.Should().ContainSingle();
        (await again.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("category.in-cycle");
    }

    [Fact]
    public async Task A_past_cycles_categories_are_read_only()
    {
        var chain = Chain();
        var existing = Existing(chain.Past);
        var sut = Sut();

        (await sut.Invoking(s => s.AddAsync(chain.Past.Id, NewGroceries)).Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("cycle.past.readonly");
        (await sut.Invoking(s => s.EditAsync(chain.Past.Id, existing.CategoryId, new EditCategoryRequest("X", null, null, null, null))).Should().ThrowAsync<DomainException>())
            .Which.Code.Should().Be("cycle.past.readonly");
        (await sut.Invoking(s => s.RemoveAsync(chain.Past.Id, existing.CategoryId)).Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("cycle.past.readonly");
        _store.Saves.Should().Be(0);
    }

    [Theory]
    [InlineData("", "shopping-cart", "blue", 0, "Name")]
    [InlineData("Groceries", "", "blue", 0, "Icon")]
    [InlineData("Groceries", "shopping-cart", "", 0, "Colour")]
    [InlineData("Groceries", "shopping-cart", "blue", -1, "SortOrder")]
    public async Task Add_validates_the_shape(string name, string icon, string colour, int sortOrder, string failing)
    {
        var chain = Chain();

        var add = () => Sut().AddAsync(chain.Current.Id, new AddCategoryRequest(null, CategoryType.Debit, name, icon, colour, sortOrder, 1m));

        (await add.Should().ThrowAsync<ValidationException>()).Which.Errors.Should().Contain(e => e.PropertyName == failing);
    }

    [Fact]
    public async Task A_new_category_needs_a_type_and_a_name_that_fits_the_column()
    {
        var chain = Chain();
        var sut = Sut();

        (await sut.Invoking(s => s.AddAsync(chain.Current.Id, NewGroceries with { Type = null })).Should().ThrowAsync<ValidationException>())
            .Which.Errors.Should().Contain(e => e.PropertyName == "Type");
        await sut.Invoking(s => s.AddAsync(chain.Current.Id, NewGroceries with { Name = new string('x', 61) })).Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task Adding_an_unknown_category_id_or_to_an_unknown_cycle_is_not_found()
    {
        var chain = Chain();
        var sut = Sut();

        (await sut.Invoking(s => s.AddAsync(chain.Current.Id, NewGroceries with { CategoryId = Guid.NewGuid() })).Should().ThrowAsync<NotFoundException>())
            .Which.Code.Should().Be("category.not-found");
        (await sut.Invoking(s => s.AddAsync(Guid.NewGuid(), NewGroceries)).Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("cycle.not-found");
    }

    [Fact]
    public async Task Edit_changes_only_the_fields_given_and_only_this_cycle()
    {
        var chain = Chain();
        var current = Existing(chain.Current);
        var future = current.CopyTo(chain.Future);
        _store.CycleCategories.Add(future);

        var dto = await Sut().EditAsync(chain.Current.Id, current.CategoryId, new EditCategoryRequest("Food", null, null, null, 750m));

        dto.Should().Be(new CycleCategoryDto(current.CategoryId, CategoryType.Debit, "Food", "shopping-cart", "blue", 0, 750m));
        (future.Name, future.BudgetAmount).Should().Be(("Groceries", 600m));
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task Edit_rejects_an_empty_request_a_negative_budget_and_an_unknown_category()
    {
        var chain = Chain();
        var existing = Existing(chain.Current);
        var sut = Sut();

        await sut.Invoking(s => s.EditAsync(chain.Current.Id, existing.CategoryId, new EditCategoryRequest(null, null, null, null, null))).Should().ThrowAsync<ValidationException>();
        (await sut.Invoking(s => s.EditAsync(chain.Current.Id, existing.CategoryId, new EditCategoryRequest(null, null, null, null, -1m))).Should().ThrowAsync<DomainException>())
            .Which.Code.Should().Be("money.negative");
        (await sut.Invoking(s => s.EditAsync(chain.Current.Id, Guid.NewGuid(), new EditCategoryRequest("X", null, null, null, null))).Should().ThrowAsync<NotFoundException>())
            .Which.Code.Should().Be("category.not-found");
    }

    [Fact]
    public async Task Remove_takes_the_category_out_of_this_cycle_unless_it_has_transactions()
    {
        var chain = Chain();
        var used = Existing(chain.Current, "Used");
        var unused = Existing(chain.Current, "Unused");
        _store.Transactions.Add(new Transaction(chain.Current, used.CategoryId, 5m, chain.Current.StartDate, null, Guid.NewGuid(), Now));
        var sut = Sut();

        await sut.RemoveAsync(chain.Current.Id, unused.CategoryId);

        _store.CycleCategories.Should().ContainSingle().Which.Should().BeSameAs(used);
        (await sut.Invoking(s => s.RemoveAsync(chain.Current.Id, used.CategoryId)).Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("category.has-transactions");
        (await sut.Invoking(s => s.RemoveAsync(chain.Current.Id, unused.CategoryId)).Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("category.not-found");
    }

    [Fact]
    public async Task Identities_carry_the_name_from_the_latest_cycle_that_has_the_category()
    {
        var chain = Chain();
        var old = Existing(chain.Past, "Groceries");
        _store.CycleCategories.Add(new CycleCategory(chain.Current, old.CategoryId, "Food", "utensils", "green", 0, 1m));
        var dropped = Existing(chain.Past, "Gym");
        _store.Categories.Add(new Category(chain.Past.UserId, CategoryType.Credit, Now));

        var identities = await Sut().ListIdentitiesAsync();

        identities.Should().BeEquivalentTo([
            new CategoryIdentityDto(old.CategoryId, CategoryType.Debit, "Food"),
            new CategoryIdentityDto(dropped.CategoryId, CategoryType.Debit, "Gym"),
        ]);
    }
}
