namespace Budget.Domain.Tests;

public class EntitlementTests
{
    private static readonly DateTimeOffset PeriodEnd = new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero);

    private static User Real() => new("Sam", "Australia/Sydney", "AUD", TestData.Now, "google:1", email: "sam@example.com");

    private static Subscription Active(User user, DateTimeOffset? periodEnd = null) =>
        new(user.Id, SubscriptionSource.AppStore, "1", SubscriptionStatus.Active, periodEnd ?? PeriodEnd, null, TestData.Now);

    [Fact]
    public void The_plans_are_what_launch_plan_D3_says()
    {
        Plans.Free.Should().Be(new PlanLimits(MaxCategoriesPerCycle: 6, PastCyclesInReports: 1, TrendChart: false));
        Plans.Premium.Should().Be(new PlanLimits(MaxCategoriesPerCycle: null, PastCyclesInReports: null, TrendChart: true));
        Plans.PremiumMonthlyPrice.Should().Be(3.99m);
        Plans.PremiumYearlyPrice.Should().Be(29.99m);
        Plans.TrialDays.Should().Be(14);
        Plans.PriceCurrency.Should().Be("AUD");
        Plans.LimitsFor(Plan.Free).Should().BeSameAs(Plans.Free);
        Plans.LimitsFor(Plan.Premium).Should().BeSameAs(Plans.Premium);
    }

    [Fact]
    public void A_user_with_nothing_is_free()
    {
        var entitlement = Entitlement.Resolve(Real(), complimentary: false, [], TestData.Now);

        entitlement.Should().Be(Entitlement.Free);
        entitlement.Source.Should().BeNull();
        entitlement.Limits.Should().Be(Plans.Free);
    }

    [Fact]
    public void The_demo_is_premium()
    {
        var demo = new User("Demo", "Australia/Sydney", "AUD", TestData.Now, isDemo: true);

        Entitlement.Resolve(demo, complimentary: false, [], TestData.Now).Should().Be(new Entitlement(Plan.Premium, PremiumSource.Demo));
    }

    [Fact]
    public void A_complimentary_account_is_premium_even_with_a_lapsed_subscription()
    {
        var user = Real();
        var lapsed = Active(user, periodEnd: TestData.Now.AddDays(-30));

        Entitlement.Resolve(user, complimentary: true, [lapsed], TestData.Now).Should().Be(new Entitlement(Plan.Premium, PremiumSource.Complimentary));
    }

    [Fact]
    public void A_subscription_that_grants_premium_makes_the_user_premium()
    {
        var user = Real();

        var entitlement = Entitlement.Resolve(user, complimentary: false, [Active(user)], TestData.Now);

        entitlement.Should().Be(new Entitlement(Plan.Premium, PremiumSource.Subscription));
        entitlement.Limits.Should().Be(Plans.Premium);
    }

    [Fact]
    public void Any_one_live_subscription_is_enough()
    {
        var user = Real();
        var expired = new Subscription(user.Id, SubscriptionSource.GooglePlay, "old", SubscriptionStatus.Expired, PeriodEnd.AddDays(-60), null, TestData.Now);

        Entitlement.Resolve(user, false, [expired], TestData.Now).Plan.Should().Be(Plan.Free);
        Entitlement.Resolve(user, false, [expired, Active(user)], TestData.Now).Plan.Should().Be(Plan.Premium);
    }

    [Fact]
    public void Someone_elses_subscription_never_counts()
    {
        var user = Real();
        var stranger = Real();

        Entitlement.Resolve(user, false, [Active(stranger)], TestData.Now).Should().Be(Entitlement.Free);
    }

    [Fact]
    public void Free_takes_up_to_six_categories_in_a_cycle()
    {
        var add = (int existing) => () => Entitlement.Free.EnsureCanAddCategory(existing);

        add(5).Should().NotThrow();
        var refused = add(6).Should().Throw<DomainException>().Which;
        refused.Code.Should().Be("plan.limit.categories");
        refused.Message.Should().Contain("6");
        add(9).Should().Throw<DomainException>().Which.Code.Should().Be("plan.limit.categories");
    }

    [Fact]
    public void Premium_takes_any_number_of_categories()
    {
        var premium = new Entitlement(Plan.Premium, PremiumSource.Subscription);

        premium.Invoking(p => p.EnsureCanAddCategory(500)).Should().NotThrow();
    }

    // 10 Apr 2026: the chain from 1 Jan has three past cycles (1 Jan, 31 Jan, 2 Mar), a current one (1 Apr) and a future one.
    [Fact]
    public void Free_reports_the_most_recent_past_cycle_and_everything_not_over()
    {
        var timeline = TestData.Chain(5);
        var today = new DateOnly(2026, 4, 10);

        var reportable = Entitlement.Free.Reportable(timeline, today);

        reportable.Should().Equal(timeline.Cycles[2], timeline.Cycles[3], timeline.Cycles[4]);
        timeline.Cycles.Should().HaveCount(5);
    }

    [Fact]
    public void Premium_reports_every_cycle()
    {
        var timeline = TestData.Chain(5);

        new Entitlement(Plan.Premium, PremiumSource.Demo).Reportable(timeline, new DateOnly(2026, 4, 10)).Should().Equal(timeline.Cycles);
    }

    [Theory]
    [InlineData(1, 0)]
    [InlineData(2, 1)]
    public void Free_with_little_history_loses_nothing(int cycles, int pastCycles)
    {
        var timeline = TestData.Chain(cycles);
        var today = new DateOnly(2026, 1, 1).AddDays(30 * pastCycles + 5);

        Entitlement.Free.Reportable(timeline, today).Should().Equal(timeline.Cycles);
    }
}
