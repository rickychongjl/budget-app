using Budget.Domain;

namespace Budget.Application.Tests;

public sealed class LoginTests
{
    private const string Oid = "0b6f2d0e-5a63-4d0b-9d3a-0e3c1f2a7b11";
    private readonly FakeStore _store = new();

    private Login Sut(params string[] allowed) => new(_store, new AllowedOids(allowed));

    private User Row(string? externalId, bool isDemo = false)
    {
        var user = new User("Test", "Australia/Sydney", "AUD", DateTimeOffset.UnixEpoch, externalId, isDemo);
        _store.Users.Add(user);
        return user;
    }

    [Fact]
    public async Task An_allowed_oid_with_a_row_resolves_to_that_user()
    {
        var user = Row(Oid);

        (await Sut(Oid).ResolveAsync(Oid.ToUpperInvariant())).Should().Be(user.Id);
    }

    [Fact]
    public async Task An_allowed_oid_without_a_row_is_refused()
    {
        await Refused(Sut(Oid), Oid);
    }

    // The tenant admitting someone is not enough: the allowlist is the second lock.
    [Fact]
    public async Task A_row_that_is_not_on_the_allowlist_is_refused()
    {
        Row(Oid);

        await Refused(Sut(), Oid);
        await Refused(Sut("someone-else"), Oid);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public async Task A_token_without_an_oid_is_refused_and_never_matches_the_demo_user(string? oid)
    {
        Row(externalId: null, isDemo: true);

        await Refused(Sut(""), oid);
    }

    private static async Task Refused(Login login, string? oid) =>
        (await login.Invoking(l => l.ResolveAsync(oid)).Should().ThrowAsync<ForbiddenException>()).Which.Code.Should().Be("auth.not-allowed");
}
