namespace Budget.Application.Tests;

public sealed class RealUsersTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 10, 1, 0, 0, TimeSpan.Zero);
    private readonly FakeStore _store = new();

    private RealUsers Sut(params string[] allowed) => new(_store, _store, new FixedClock(Now), new AllowedOids(allowed));

    [Fact]
    public async Task Ensure_creates_one_row_per_allowed_oid_once()
    {
        await Sut("oid-a", "oid-b").EnsureExistAsync();
        await Sut("oid-a", "oid-b").EnsureExistAsync();

        _store.Users.Select(u => u.ExternalId).Should().BeEquivalentTo("oid-a", "oid-b");
        _store.Users.Should().AllSatisfy(u => u.Should().BeEquivalentTo(new { DisplayName = "Me", TimeZone = "Australia/Sydney", Currency = "AUD", IsDemo = false, CreatedAt = Now }));
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task An_empty_allowlist_creates_nobody()
    {
        await Sut().EnsureExistAsync();

        _store.Users.Should().BeEmpty();
        _store.Saves.Should().Be(0);
    }
}
