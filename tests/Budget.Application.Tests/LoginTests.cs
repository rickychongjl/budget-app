using Budget.Domain;

namespace Budget.Application.Tests;

public sealed class LoginTests
{
    private const string Subject = "109876543210987654321";
    private const string ExternalId = "google:" + Subject;
    private const string LegacyOid = "0b6f2d0e-5a63-4d0b-9d3a-0e3c1f2a7b11";
    private static readonly DateTimeOffset Now = new(2026, 11, 15, 1, 0, 0, TimeSpan.Zero);
    private readonly FakeStore _store = new();

    private Login Sut(string? adoptEmail = null) =>
        new(_store, _store, new FixedClock(Now), new LegacyAccountAdoption(_store, new LegacyAccountSettings(adoptEmail)));

    private static ExternalSignIn Google(
        string? subject = Subject, string? email = "someone@example.com", bool emailVerified = true, string? name = "Someone Real") =>
        new("google", subject, email, emailVerified, name);

    private User Row(string? externalId, bool isDemo = false, string? email = null)
    {
        var user = new User("Existing", "Australia/Sydney", "AUD", DateTimeOffset.UnixEpoch, externalId, isDemo, email);
        _store.Users.Add(user);
        return user;
    }

    [Fact]
    public async Task A_known_subject_resolves_to_its_user_without_creating_anyone()
    {
        var user = Row(ExternalId, email: "someone@example.com");

        (await Sut().ResolveAsync(Google())).Should().Be(user.Id);

        _store.Users.Should().ContainSingle();
        _store.Saves.Should().Be(0, "nothing changed, so nothing is written");
    }

    [Fact]
    public async Task A_known_subject_keeps_its_profile_but_takes_the_providers_current_email()
    {
        var user = Row(ExternalId, email: "old@example.com");

        await Sut().ResolveAsync(Google(email: "new@example.com", name: "A New Name"));

        user.Email.Should().Be("new@example.com");
        user.DisplayName.Should().Be("Existing", "the name is the user's to change after the first sign-in");
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task An_unknown_subject_is_provisioned_on_first_sign_in()
    {
        var id = await Sut().ResolveAsync(Google());

        var user = _store.Users.Should().ContainSingle().Subject;
        user.Id.Should().Be(id);
        user.Should().BeEquivalentTo(new
        {
            ExternalId,
            Email = "someone@example.com",
            DisplayName = "Someone Real",
            TimeZone = "Australia/Sydney",
            Currency = "AUD",
            IsDemo = false,
            CreatedAt = Now,
        });
        _store.Saves.Should().Be(1);

        (await Sut().ResolveAsync(Google())).Should().Be(id, "the second sign-in finds the row the first one made");
        _store.Users.Should().ContainSingle();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Without_a_name_in_the_token_the_new_user_is_called_me(string? name)
    {
        await Sut().ResolveAsync(Google(name: name));

        _store.Users.Single().DisplayName.Should().Be("Me");
    }

    [Fact]
    public async Task A_long_name_is_trimmed_and_cut_to_the_column()
    {
        await Sut().ResolveAsync(Google(name: "  " + new string('a', 150) + "  "));

        _store.Users.Single().DisplayName.Should().Be(new string('a', 100));
    }

    [Fact]
    public async Task An_email_too_long_for_the_column_is_not_kept()
    {
        await Sut().ResolveAsync(Google(email: new string('a', 250) + "@example.com"));

        _store.Users.Single().Email.Should().BeNull();
    }

    [Fact]
    public async Task Losing_the_first_sign_in_race_returns_the_row_that_won()
    {
        var winner = new User("Winner", "Australia/Sydney", "AUD", Now, ExternalId);
        _store.FailNextSave = new ConflictException("conflict", "duplicate");
        // What the real unit of work does on a conflict (drops the loser), and what the other request did (saved its row).
        _store.OnFailedSave = () =>
        {
            _store.Users.RemoveAll(u => u.ExternalId == ExternalId);
            _store.Users.Add(winner);
        };

        (await Sut().ResolveAsync(Google())).Should().Be(winner.Id);
        _store.Users.Should().ContainSingle();
    }

    [Fact]
    public async Task A_conflict_with_no_winner_to_read_back_is_not_swallowed()
    {
        _store.FailNextSave = new ConflictException("conflict", "duplicate");
        _store.OnFailedSave = () => _store.Users.Clear();

        await Sut().Invoking(s => s.ResolveAsync(Google())).Should().ThrowAsync<ConflictException>();
    }

    // Google says whether it has checked the address. An unchecked one could be anybody's, so it is not good enough to
    // create an account on, and never good enough to take over the original one.
    [Fact]
    public async Task An_unverified_email_is_refused_and_creates_nobody()
    {
        await Refused(Sut(), Google(emailVerified: false), "auth.email-unverified");
        await Refused(Sut(), Google(email: null), "auth.email-unverified");
        await Refused(Sut(), Google(email: " "), "auth.email-unverified");

        _store.Users.Should().BeEmpty();
        _store.Saves.Should().Be(0);
    }

    [Fact]
    public async Task An_unverified_email_is_refused_even_for_a_known_subject()
    {
        Row(ExternalId);

        await Refused(Sut(), Google(emailVerified: false), "auth.email-unverified");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    public async Task A_token_without_a_subject_is_refused_and_never_matches_the_demo_user(string? subject)
    {
        Row(externalId: null, isDemo: true);

        await Refused(Sut(), Google(subject: subject), "auth.failed");
        _store.Users.Should().ContainSingle();
    }

    [Fact]
    public async Task A_subject_too_long_for_the_column_is_refused()
    {
        await Refused(Sut(), Google(subject: new string('1', ExternalIdentity.MaxLength)), "auth.failed");
        _store.Users.Should().BeEmpty();
    }

    [Fact]
    public async Task The_same_subject_from_another_provider_is_another_account()
    {
        var google = Row(ExternalId);

        var other = await Sut().ResolveAsync(Google() with { Provider = "apple" });

        other.Should().NotBe(google.Id);
        _store.Users.Single(u => u.Id == other).ExternalId.Should().Be("apple:" + Subject);
    }

    [Fact]
    public async Task The_original_account_is_adopted_instead_of_a_new_one_being_made()
    {
        var legacy = Row(LegacyOid);

        var id = await Sut(adoptEmail: "owner@example.com").ResolveAsync(Google(email: "owner@example.com"));

        id.Should().Be(legacy.Id);
        legacy.ExternalId.Should().Be(ExternalId);
        legacy.Email.Should().Be("owner@example.com");
        legacy.DisplayName.Should().Be("Existing");
        _store.Users.Should().ContainSingle();
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task Adoption_happens_once_and_later_sign_ins_are_ordinary()
    {
        var legacy = Row(LegacyOid);
        var login = Sut(adoptEmail: "owner@example.com");

        await login.ResolveAsync(Google(email: "owner@example.com"));
        var again = await login.ResolveAsync(Google(email: "owner@example.com"));

        again.Should().Be(legacy.Id);
        _store.Users.Should().ContainSingle();
        _store.Saves.Should().Be(1, "the second sign-in found the linked row and had nothing to change");
    }

    // Already linked: some other row (here, one made before the setting was added) owns the Google subject.
    // The subject decides, and the legacy row is left as it is rather than two rows claiming one person.
    [Fact]
    public async Task A_subject_that_is_already_linked_is_not_moved_onto_the_legacy_row()
    {
        var linked = Row(ExternalId);
        var legacy = Row(LegacyOid);

        var id = await Sut(adoptEmail: "owner@example.com").ResolveAsync(Google(email: "owner@example.com"));

        id.Should().Be(linked.Id);
        legacy.ExternalId.Should().Be(LegacyOid);
    }

    [Fact]
    public async Task An_unverified_email_never_adopts_the_original_account()
    {
        var legacy = Row(LegacyOid);

        await Refused(Sut(adoptEmail: "owner@example.com"), Google(email: "owner@example.com", emailVerified: false), "auth.email-unverified");

        legacy.ExternalId.Should().Be(LegacyOid);
    }

    [Fact]
    public async Task Someone_else_signing_in_gets_a_new_account_and_the_original_is_untouched()
    {
        var legacy = Row(LegacyOid);

        var id = await Sut(adoptEmail: "owner@example.com").ResolveAsync(Google(email: "stranger@example.com"));

        id.Should().NotBe(legacy.Id);
        legacy.ExternalId.Should().Be(LegacyOid);
        _store.Users.Should().HaveCount(2);
    }

    private static async Task Refused(Login login, ExternalSignIn signIn, string code) =>
        (await login.Invoking(l => l.ResolveAsync(signIn)).Should().ThrowAsync<ForbiddenException>()).Which.Code.Should().Be(code);
}
