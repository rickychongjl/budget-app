using Budget.Domain;

namespace Budget.Application.Tests;

// Replaces RealUsersTests: real users are no longer made by migrate from an allowlist. What is left of that era is the
// original account, still keyed by its Entra oid, which the first Google sign-in with the configured email takes over.
public sealed class LegacyAccountAdoptionTests
{
    private const string Owner = "owner@example.com";
    private const string GoogleId = "google:109876543210987654321";
    private const string LegacyOid = "0b6f2d0e-5a63-4d0b-9d3a-0e3c1f2a7b11";
    private readonly FakeStore _store = new();

    private LegacyAccountAdoption Sut(string? adoptEmail = Owner) => new(_store, new LegacyAccountSettings(adoptEmail));

    private User Row(string? externalId, bool isDemo = false)
    {
        var user = new User("Existing", "Australia/Sydney", "AUD", DateTimeOffset.UnixEpoch, externalId, isDemo);
        _store.Users.Add(user);
        return user;
    }

    [Fact]
    public async Task The_one_legacy_row_is_repointed_at_the_google_subject()
    {
        var legacy = Row(LegacyOid);

        var adopted = await Sut().TryAdoptAsync(GoogleId, Owner);

        adopted.Should().BeSameAs(legacy);
        legacy.ExternalId.Should().Be(GoogleId);
        _store.Saves.Should().Be(0, "the caller saves, together with the email it sets");
    }

    [Theory]
    [InlineData("OWNER@example.com")]
    [InlineData(" owner@example.com ")]
    public async Task The_email_is_compared_without_case_or_surrounding_space(string email)
    {
        var legacy = Row(LegacyOid);

        (await Sut(adoptEmail: " Owner@Example.com").TryAdoptAsync(GoogleId, email)).Should().BeSameAs(legacy);
    }

    [Fact]
    public async Task A_different_email_adopts_nothing()
    {
        var legacy = Row(LegacyOid);

        (await Sut().TryAdoptAsync(GoogleId, "someone@example.com")).Should().BeNull();
        legacy.ExternalId.Should().Be(LegacyOid);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public async Task Without_the_setting_nothing_is_ever_adopted(string? adoptEmail)
    {
        var legacy = Row(LegacyOid);

        (await Sut(adoptEmail).TryAdoptAsync(GoogleId, Owner)).Should().BeNull();
        (await Sut(adoptEmail).TryAdoptAsync(GoogleId, adoptEmail ?? "")).Should().BeNull();
        legacy.ExternalId.Should().Be(LegacyOid);
    }

    [Fact]
    public async Task With_no_legacy_row_there_is_nothing_to_adopt()
    {
        Row(GoogleId.Replace("1", "2", StringComparison.Ordinal));

        (await Sut().TryAdoptAsync(GoogleId, Owner)).Should().BeNull();
    }

    // Two candidates means the setting cannot say which is the owner's, so neither is taken.
    [Fact]
    public async Task With_more_than_one_legacy_row_nothing_is_adopted()
    {
        var first = Row(LegacyOid);
        var second = Row("6c1d0b4e-2f1a-4b7e-9d0c-3a5e7f9b1c2d");

        (await Sut().TryAdoptAsync(GoogleId, Owner)).Should().BeNull();
        first.ExternalId.Should().Be(LegacyOid);
        second.ExternalId.Should().Be("6c1d0b4e-2f1a-4b7e-9d0c-3a5e7f9b1c2d");
    }

    // Only a bare oid is legacy: the demo row, a row with no external id and an already provider-qualified row are not.
    [Fact]
    public async Task The_demo_user_rows_without_an_external_id_and_qualified_rows_are_never_candidates()
    {
        var demo = Row(externalId: null, isDemo: true);
        var unlinked = Row(externalId: null);
        var other = Row("google:555");

        (await Sut().TryAdoptAsync(GoogleId, Owner)).Should().BeNull();
        demo.ExternalId.Should().BeNull();
        unlinked.ExternalId.Should().BeNull();
        other.ExternalId.Should().Be("google:555");
    }

    [Fact]
    public async Task The_other_rows_do_not_stop_the_one_legacy_row_being_found()
    {
        Row(externalId: null, isDemo: true);
        Row("google:555");
        var legacy = Row(LegacyOid);

        (await Sut().TryAdoptAsync(GoogleId, Owner)).Should().BeSameAs(legacy);
    }
}
