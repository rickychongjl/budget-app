namespace Budget.Domain.Tests;

public class UserTests
{
    private static User Sydney() => new("Ricky", "Australia/Sydney", "AUD", TestData.Now);

    [Theory]
    // AEDT (+11): 13:30 UTC is already tomorrow.
    [InlineData("2026-01-15T13:30:00Z", "2026-01-16")]
    [InlineData("2026-01-15T12:59:00Z", "2026-01-15")]
    // DST ended 5 Apr 2026 (+10): 13:30 UTC is still today, 14:00 UTC is tomorrow.
    [InlineData("2026-04-05T13:30:00Z", "2026-04-05")]
    [InlineData("2026-04-05T14:00:00Z", "2026-04-06")]
    // DST starts 4 Oct 2026: the day before is +10, the day itself is +11.
    [InlineData("2026-10-03T13:30:00Z", "2026-10-03")]
    [InlineData("2026-10-04T13:30:00Z", "2026-10-05")]
    public void Today_is_resolved_in_the_users_time_zone(string utcNow, string expected)
    {
        var clock = new FixedClock(DateTimeOffset.Parse(utcNow));

        Sydney().Today(clock).Should().Be(DateOnly.Parse(expected));
    }

    [Fact]
    public void Unknown_time_zone_is_rejected()
    {
        var act = () => new User("Ricky", "Mars/Olympus_Mons", "AUD", TestData.Now);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("user.timezone.unknown");
    }

    [Fact]
    public void Real_user_has_an_external_id_and_demo_user_does_not()
    {
        var real = new User("Ricky", "Australia/Sydney", "AUD", TestData.Now, externalId: "oid-123");
        var demo = new User("Demo", "Australia/Sydney", "AUD", TestData.Now, isDemo: true);

        real.ExternalId.Should().Be("oid-123");
        real.IsDemo.Should().BeFalse();
        demo.ExternalId.Should().BeNull();
        demo.IsDemo.Should().BeTrue();
        demo.Id.Should().NotBe(real.Id);
        demo.DisplayName.Should().Be("Demo");
        demo.Currency.Should().Be("AUD");
        demo.CreatedAt.Should().Be(TestData.Now);
    }
}
