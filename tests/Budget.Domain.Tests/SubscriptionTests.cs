namespace Budget.Domain.Tests;

public class SubscriptionTests
{
    private static readonly DateTimeOffset PeriodEnd = new(2026, 2, 1, 0, 0, 0, TimeSpan.Zero);

    private static Subscription With(SubscriptionStatus status, DateTimeOffset? periodEnd = null, DateTimeOffset? trialEnd = null) =>
        new(TestData.UserId, SubscriptionSource.AppStore, "1000000123", status, periodEnd, trialEnd, TestData.Now);

    [Fact]
    public void A_new_subscription_is_premium_and_stamped()
    {
        var subscription = With(SubscriptionStatus.Trialing, PeriodEnd, PeriodEnd);

        subscription.Plan.Should().Be(Plan.Premium);
        subscription.UserId.Should().Be(TestData.UserId);
        subscription.Source.Should().Be(SubscriptionSource.AppStore);
        subscription.ExternalId.Should().Be("1000000123");
        subscription.CancelAtPeriodEnd.Should().BeFalse();
        subscription.CreatedAt.Should().Be(TestData.Now);
        subscription.UpdatedAt.Should().Be(TestData.Now);
    }

    [Fact]
    public void Update_changes_the_state_and_the_stamp_but_not_the_identity()
    {
        var subscription = With(SubscriptionStatus.Trialing, PeriodEnd, PeriodEnd);
        var later = TestData.Now.AddDays(5);

        subscription.Update(SubscriptionStatus.Active, PeriodEnd.AddDays(30), null, cancelAtPeriodEnd: true, later);

        subscription.Status.Should().Be(SubscriptionStatus.Active);
        subscription.CurrentPeriodEnd.Should().Be(PeriodEnd.AddDays(30));
        subscription.TrialEnd.Should().BeNull();
        subscription.CancelAtPeriodEnd.Should().BeTrue();
        subscription.UpdatedAt.Should().Be(later);
        subscription.CreatedAt.Should().Be(TestData.Now);
    }

    [Theory]
    [InlineData(SubscriptionStatus.Trialing, true)]
    [InlineData(SubscriptionStatus.Active, true)]
    [InlineData(SubscriptionStatus.PastDue, true)]
    [InlineData(SubscriptionStatus.Cancelled, false)]
    [InlineData(SubscriptionStatus.Expired, false)]
    public void Only_trialing_active_and_past_due_grant_premium_within_the_period(SubscriptionStatus status, bool premium)
    {
        With(status, PeriodEnd).GrantsPremium(PeriodEnd.AddDays(-1)).Should().Be(premium);
    }

    [Theory]
    [InlineData(SubscriptionStatus.Active)]
    [InlineData(SubscriptionStatus.PastDue)]
    public void The_grace_is_three_days_after_the_period_end(SubscriptionStatus status)
    {
        var subscription = With(status, PeriodEnd);

        subscription.GrantsPremium(PeriodEnd.AddDays(3)).Should().BeTrue();
        subscription.GrantsPremium(PeriodEnd.AddDays(3).AddSeconds(1)).Should().BeFalse();
    }

    [Fact]
    public void A_trial_runs_to_its_trial_end_plus_the_grace()
    {
        var trial = With(SubscriptionStatus.Trialing, periodEnd: PeriodEnd.AddDays(30), trialEnd: PeriodEnd);

        trial.GrantsPremium(PeriodEnd.AddDays(3)).Should().BeTrue();
        trial.GrantsPremium(PeriodEnd.AddDays(4)).Should().BeFalse();
    }

    [Fact]
    public void Past_due_with_no_period_end_grants_nothing()
    {
        With(SubscriptionStatus.PastDue).GrantsPremium(TestData.Now).Should().BeFalse();
    }

    // A manual grant has no dates: it lasts until someone changes its status.
    [Theory]
    [InlineData(SubscriptionStatus.Active)]
    [InlineData(SubscriptionStatus.Trialing)]
    public void An_active_row_with_no_end_date_grants_premium(SubscriptionStatus status)
    {
        With(status).GrantsPremium(TestData.Now.AddYears(5)).Should().BeTrue();
    }

    [Fact]
    public void Codes_round_trip_for_every_value()
    {
        foreach (var source in Enum.GetValues<SubscriptionSource>())
        {
            SubscriptionCodes.ParseSource(SubscriptionCodes.Of(source)).Should().Be(source);
        }

        foreach (var status in Enum.GetValues<SubscriptionStatus>())
        {
            SubscriptionCodes.ParseStatus(SubscriptionCodes.Of(status)).Should().Be(status);
        }

        SubscriptionCodes.ParsePlan(SubscriptionCodes.Of(Plan.Premium)).Should().Be(Plan.Premium);
    }

    [Fact]
    public void Codes_are_the_stores_spelling()
    {
        SubscriptionCodes.Of(SubscriptionSource.AppStore).Should().Be("app_store");
        SubscriptionCodes.Of(SubscriptionSource.GooglePlay).Should().Be("google_play");
        SubscriptionCodes.Of(SubscriptionSource.Manual).Should().Be("manual");
        SubscriptionCodes.Of(SubscriptionStatus.PastDue).Should().Be("past_due");
        SubscriptionCodes.Of(Plan.Premium).Should().Be("premium");
        SubscriptionCodes.Sources.Should().HaveCount(Enum.GetValues<SubscriptionSource>().Length);
        SubscriptionCodes.Statuses.Should().HaveCount(Enum.GetValues<SubscriptionStatus>().Length);
    }

    [Fact]
    public void Unknown_codes_are_refused()
    {
        var source = () => SubscriptionCodes.ParseSource("stripe");
        var status = () => SubscriptionCodes.ParseStatus("Active");
        var plan = () => SubscriptionCodes.ParsePlan("free");
        var free = () => SubscriptionCodes.Of(Plan.Free);

        source.Should().Throw<DomainException>().Which.Code.Should().Be("subscription.code.unknown");
        status.Should().Throw<DomainException>().Which.Code.Should().Be("subscription.code.unknown");
        plan.Should().Throw<DomainException>().Which.Code.Should().Be("subscription.code.unknown");
        free.Should().Throw<DomainException>().Which.Code.Should().Be("subscription.code.unknown");
    }
}
