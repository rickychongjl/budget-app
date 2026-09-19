namespace Budget.Application.Tests;

public sealed class MeTests
{
    private readonly FakeStore _store = new();

    [Fact]
    public async Task Get_returns_the_current_users_profile()
    {
        var user = _store.SignIn(isDemo: true);

        var me = await new Me(_store, _store).GetAsync();

        me.Should().Be(new MeDto(user.Id, "Test", "Australia/Sydney", "AUD", IsDemo: true, CycleLengthDays: 30));
    }

    [Fact]
    public async Task Get_for_an_unknown_user_is_not_found()
    {
        _store.Id = Guid.NewGuid();

        var get = () => new Me(_store, _store).GetAsync();

        (await get.Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("user.not-found");
    }
}
