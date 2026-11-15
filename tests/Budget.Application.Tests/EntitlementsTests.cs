using Budget.Domain;

namespace Budget.Application.Tests;

// Every plan gate through the real use cases, on both plans. 10 Apr 2026 in Sydney: a chain from 1 Jan has three past
// cycles (1 Jan, 31 Jan, 2 Mar), the current one (1 Apr) and an upcoming one (1 May).
public sealed class EntitlementsTests
{
    private static readonly DateTimeOffset Now = new(2026, 4, 10, 1, 0, 0, TimeSpan.Zero);
    private static readonly AddCategoryRequest NewCategory = new(null, CategoryType.Debit, "Extra", "tag", "blue", 99, 50m);
    private const string Email = "owner@example.com";

    private readonly FakeStore _store = new();
    private readonly FixedClock _clock = new(Now);

    private CycleFinder Finder() => new(_store, new UserToday(_store, _store, _clock));

    private CycleCategories Categories(string? complimentary = null) =>
        new(_store, _store, _store, _store, Finder(), new DemoCaps(_store, _store, _store, _store), _store.Entitlements(_clock, complimentary), _clock);

    private Reports Reports(string? complimentary = null) => new(_store, _store, Finder(), _store.Entitlements(_clock, complimentary));

    private Me Me(string? complimentary = null) => new(_store, _store, _store, _store.Entitlements(_clock, complimentary));

    private List<Cycle> Chain(bool isDemo = false, string? email = null)
    {
        var first = new Cycle(_store.SignIn(isDemo: isDemo, email: email).Id, new DateOnly(2026, 1, 1));
        first.Confirm();
        var cycles = new List<Cycle> { first };
        while (cycles.Count < 5)
        {
            cycles.Add(cycles[^1].CreateNext());
        }

        _store.Cycles.AddRange(cycles);
        return cycles;
    }

    private Cycle Current(List<Cycle> chain) => chain[3];

    private void Fill(Cycle cycle, int count)
    {
        for (var i = 0; i < count; i++)
        {
            var category = new Category(cycle.UserId, CategoryType.Debit, Now);
            _store.Categories.Add(category);
            _store.CycleCategories.Add(new CycleCategory(cycle, category.Id, $"Category {i}", "tag", "blue", i, 100m));
        }
    }

    private int InCycle(Cycle cycle) => _store.CycleCategories.Count(c => c.CycleId == cycle.Id);

    private void Subscribe(SubscriptionStatus status, DateTimeOffset? periodEnd) =>
        _store.Subscriptions.Add(new Subscription(_store.Id, SubscriptionSource.AppStore, "1000000001", status, periodEnd, null, Now.AddDays(-40)));

    [Fact]
    public async Task Free_adds_up_to_six_categories_in_a_cycle_and_no_more()
    {
        var current = Current(Chain());
        Fill(current, 5);

        await Categories().AddAsync(current.Id, NewCategory);
        var seventh = () => Categories().AddAsync(current.Id, NewCategory with { Name = "Seventh" });

        (await seventh.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("plan.limit.categories");
        InCycle(current).Should().Be(6);
        _store.Categories.Should().HaveCount(6);
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task Free_cannot_put_an_existing_category_into_a_full_cycle_either()
    {
        var chain = Chain();
        Fill(Current(chain), 1);
        Fill(chain[4], 6);
        var existing = _store.CycleCategories.First(c => c.CycleId == Current(chain).Id).CategoryId;

        var add = () => Categories().AddAsync(chain[4].Id, NewCategory with { CategoryId = existing, Type = null });

        (await add.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("plan.limit.categories");
        InCycle(chain[4]).Should().Be(6);
    }

    [Fact]
    public async Task The_limit_is_per_cycle()
    {
        var chain = Chain();
        Fill(Current(chain), 6);

        await Categories().AddAsync(chain[4].Id, NewCategory);

        InCycle(chain[4]).Should().Be(1);
    }

    // Onboarding adds the first cycle's categories one at a time through the same use case, so the draft is held to it.
    [Fact]
    public async Task Onboarding_is_held_to_the_free_limit()
    {
        var draft = new Cycle(_store.SignIn().Id, new DateOnly(2026, 4, 8));
        _store.Cycles.Add(draft);
        Fill(draft, 6);

        var add = () => Categories().AddAsync(draft.Id, NewCategory);

        (await add.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("plan.limit.categories");
    }

    [Fact]
    public async Task Premium_adds_any_number_of_categories()
    {
        var current = Current(Chain());
        Fill(current, 6);
        Subscribe(SubscriptionStatus.Active, Now.AddDays(20));

        await Categories().AddAsync(current.Id, NewCategory);
        await Categories().AddAsync(current.Id, NewCategory with { Name = "Eighth" });

        InCycle(current).Should().Be(8);
    }

    // The demo is Premium so interview demos show everything; DemoCapsTests show its own caps still apply.
    [Fact]
    public async Task The_demo_is_not_held_to_the_free_limit()
    {
        var current = Current(Chain(isDemo: true));
        Fill(current, 6);

        await Categories().AddAsync(current.Id, NewCategory);

        InCycle(current).Should().Be(7);
    }

    [Theory]
    [InlineData(Email)]
    [InlineData(" OWNER@example.com ,someone@else.test")]
    [InlineData("first@example.com,owner@EXAMPLE.com")]
    public async Task A_complimentary_email_is_premium_ignoring_case_and_spaces(string setting)
    {
        var current = Current(Chain(email: Email));
        Fill(current, 6);

        await Categories(setting).AddAsync(current.Id, NewCategory);
        var me = await Me(setting).GetAsync();

        InCycle(current).Should().Be(7);
        me.Plan.Should().Be("premium");
        me.PlanSource.Should().Be("complimentary");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("other@example.com")]
    [InlineData("owner@example")]
    public async Task Anything_else_in_the_setting_grants_nothing(string? setting)
    {
        Chain(email: Email);

        (await Me(setting).GetAsync()).Plan.Should().Be("free");
    }

    [Fact]
    public async Task An_account_without_an_email_is_never_complimentary()
    {
        Chain();

        (await Me(",").GetAsync()).Plan.Should().Be("free");
    }

    [Fact]
    public async Task Past_due_keeps_premium_for_three_days_after_the_period_end()
    {
        Chain();

        Subscribe(SubscriptionStatus.PastDue, Now.AddDays(-3));
        (await Me().GetAsync()).PlanSource.Should().Be("subscription");

        _store.Subscriptions.Clear();
        Subscribe(SubscriptionStatus.PastDue, Now.AddDays(-3).AddMinutes(-1));
        (await Me().GetAsync()).Plan.Should().Be("free");
    }

    [Theory]
    [InlineData(SubscriptionStatus.Trialing, 10, "premium")]
    [InlineData(SubscriptionStatus.Active, 10, "premium")]
    [InlineData(SubscriptionStatus.Active, -10, "free")]
    [InlineData(SubscriptionStatus.Cancelled, 10, "free")]
    [InlineData(SubscriptionStatus.Expired, 10, "free")]
    public async Task Each_subscription_state_gives_the_plan_it_should(SubscriptionStatus status, int periodEndInDays, string plan)
    {
        Chain();
        Subscribe(status, Now.AddDays(periodEndInDays));

        (await Me().GetAsync()).Plan.Should().Be(plan);
    }

    [Fact]
    public async Task A_downgraded_user_keeps_every_category_and_transaction()
    {
        var current = Current(Chain());
        Fill(current, 9);
        var spentIn = _store.CycleCategories.First(c => c.CycleId == current.Id);
        _store.Transactions.Add(new Transaction(current, spentIn.CategoryId, 12m, current.StartDate, null, Guid.NewGuid(), Now));
        Subscribe(SubscriptionStatus.Expired, Now.AddDays(-30));

        var add = () => Categories().AddAsync(current.Id, NewCategory);
        (await add.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("plan.limit.categories");

        // Still all there, still editable and removable.
        InCycle(current).Should().Be(9);
        _store.Transactions.Should().ContainSingle();
        var other = _store.CycleCategories.Last(c => c.CycleId == current.Id);
        await Categories().EditAsync(current.Id, other.CategoryId, new EditCategoryRequest("Renamed", null, null, null, null));
        other.Name.Should().Be("Renamed");

        // Back under the limit, adding works again.
        foreach (var removable in _store.CycleCategories.Where(c => c.CycleId == current.Id && c != spentIn).Take(4).ToList())
        {
            await Categories().RemoveAsync(current.Id, removable.CategoryId);
        }

        await Categories().AddAsync(current.Id, NewCategory);
        InCycle(current).Should().Be(6);
    }

    [Fact]
    public async Task Free_reports_the_most_recent_past_cycle_and_everything_not_over()
    {
        var chain = Chain();

        var report = await Reports().ListAsync();

        report.Select(r => r.Cycle.Id).Should().Equal(chain[2].Id, chain[3].Id, chain[4].Id);
        _store.Cycles.Should().HaveCount(5);
    }

    [Fact]
    public async Task Premium_reports_every_cycle()
    {
        var chain = Chain();
        Subscribe(SubscriptionStatus.Active, Now.AddDays(20));

        var report = await Reports().ListAsync();

        report.Select(r => r.Cycle.Id).Should().Equal(chain.Select(c => c.Id));
    }

    [Fact]
    public async Task A_downgraded_users_older_cycles_come_back_with_premium()
    {
        var chain = Chain();
        Subscribe(SubscriptionStatus.Expired, Now.AddDays(-30));

        (await Reports().ListAsync()).Should().HaveCount(3);

        Subscribe(SubscriptionStatus.Active, Now.AddDays(20));

        (await Reports().ListAsync()).Should().HaveCount(chain.Count);
    }

    [Fact]
    public async Task Me_reports_free_with_its_limits()
    {
        var user = _store.SignIn();

        var me = await Me().GetAsync();

        me.Should().Be(new MeDto(user.Id, "Test", "Australia/Sydney", "AUD", false, 30, "free", null, Plans.Free));
    }

    [Fact]
    public async Task Me_reports_premium_from_a_subscription_after_an_update_too()
    {
        _store.SignIn();
        Subscribe(SubscriptionStatus.Trialing, Now.AddDays(14));

        var me = await Me().UpdateAsync(new UpdateMeRequest("Sam", null));

        me.Plan.Should().Be("premium");
        me.PlanSource.Should().Be("subscription");
        me.Limits.Should().Be(Plans.Premium);
    }

    [Fact]
    public async Task An_unknown_user_has_no_plan()
    {
        _store.Id = Guid.NewGuid();

        var get = () => _store.Entitlements(_clock).GetAsync();

        (await get.Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("user.not-found");
    }

    [Fact]
    public async Task Another_users_subscription_does_not_make_me_premium()
    {
        _store.SignIn();
        Subscribe(SubscriptionStatus.Active, Now.AddDays(20));
        _store.SignIn();

        (await _store.Entitlements(_clock).GetAsync()).Should().Be(Entitlement.Free);
    }

    [Fact]
    public void The_catalogue_is_the_plans()
    {
        PlanCatalogueDto.Current.Should().Be(new PlanCatalogueDto(Plans.Free, Plans.Premium, new PlanPriceDto("AUD", 3.99m, 29.99m, 14)));
    }
}
