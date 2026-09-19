namespace Budget.Application.Tests;

public sealed class DemoUserTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 10, 1, 0, 0, TimeSpan.Zero);
    private readonly FakeStore _store = new();

    private DemoUser Sut() => new(_store, _store, new FixedClock(Now));

    [Fact]
    public async Task Ensure_creates_the_demo_user_once()
    {
        _store.SignIn();

        await Sut().EnsureExistsAsync();
        await Sut().EnsureExistsAsync();

        var demo = _store.Users.Should().ContainSingle(u => u.IsDemo).Subject;
        demo.Should().BeEquivalentTo(new { DisplayName = "Demo", TimeZone = "Australia/Sydney", Currency = "AUD", ExternalId = (string?)null, CreatedAt = Now });
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task The_demo_users_id_is_what_a_demo_session_signs_in_as()
    {
        await Sut().EnsureExistsAsync();

        (await Sut().GetIdAsync()).Should().Be(_store.Users.Single().Id);
    }

    [Fact]
    public async Task Without_a_demo_user_there_is_no_demo()
    {
        _store.SignIn();

        (await Sut().Invoking(s => s.GetIdAsync()).Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("demo.unavailable");
    }
}
