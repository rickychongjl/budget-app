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
        var real = new User("Ricky", "Australia/Sydney", "AUD", TestData.Now, externalId: "google:123");
        var demo = new User("Demo", "Australia/Sydney", "AUD", TestData.Now, isDemo: true);

        real.ExternalId.Should().Be("google:123");
        real.IsDemo.Should().BeFalse();
        demo.ExternalId.Should().BeNull();
        demo.IsDemo.Should().BeTrue();
        demo.Id.Should().NotBe(real.Id);
        demo.DisplayName.Should().Be("Demo");
        demo.Currency.Should().Be("AUD");
        demo.CreatedAt.Should().Be(TestData.Now);
    }

    [Fact]
    public void Display_name_and_time_zone_can_change_and_today_follows_the_new_zone()
    {
        var user = Sydney();
        var clock = new FixedClock(DateTimeOffset.Parse("2026-01-15T13:30:00Z"));

        user.Rename("Ricky C");
        user.ChangeTimeZone("Europe/London");

        user.DisplayName.Should().Be("Ricky C");
        user.TimeZone.Should().Be("Europe/London");
        user.Today(clock).Should().Be(new DateOnly(2026, 1, 15));
    }

    [Fact]
    public void Changing_to_an_unknown_time_zone_is_rejected_and_changes_nothing()
    {
        var user = Sydney();

        var act = () => user.ChangeTimeZone("Mars/Olympus_Mons");

        act.Should().Throw<DomainException>().Which.Code.Should().Be("user.timezone.unknown");
        user.TimeZone.Should().Be("Australia/Sydney");
    }

    [Fact]
    public void Email_is_optional_and_follows_the_provider()
    {
        var user = new User("Ricky", "Australia/Sydney", "AUD", TestData.Now, externalId: "google:123", email: "first@example.com");

        user.Email.Should().Be("first@example.com");

        user.ChangeEmail("second@example.com");
        user.Email.Should().Be("second@example.com");

        user.ChangeEmail(null);
        user.Email.Should().BeNull();
        Sydney().Email.Should().BeNull();
    }

    // The one-off move of the original account from its Entra oid to a Google subject: same row, same data, new key.
    [Fact]
    public void A_real_user_can_be_linked_to_another_external_id_and_keeps_its_identity()
    {
        var user = new User("Ricky", "Australia/Sydney", "AUD", TestData.Now, externalId: "0b6f2d0e-5a63-4d0b-9d3a-0e3c1f2a7b11");
        var id = user.Id;

        user.LinkTo("google:123");

        user.ExternalId.Should().Be("google:123");
        user.Id.Should().Be(id);
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    public void Linking_to_a_blank_external_id_is_rejected(string externalId)
    {
        var user = new User("Ricky", "Australia/Sydney", "AUD", TestData.Now, externalId: "oid");

        var act = () => user.LinkTo(externalId);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("user.external-id.blank");
        user.ExternalId.Should().Be("oid");
    }

    // The demo row is shared by every visitor; tying it to one person's account would hand them everyone's demo session.
    [Fact]
    public void The_demo_user_cannot_be_linked()
    {
        var demo = new User("Demo", "Australia/Sydney", "AUD", TestData.Now, isDemo: true);

        var act = () => demo.LinkTo("google:123");

        act.Should().Throw<DomainException>().Which.Code.Should().Be("user.demo.unlinkable");
        demo.ExternalId.Should().BeNull();
    }
}
