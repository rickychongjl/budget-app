using Budget.Domain;
using FluentValidation;

namespace Budget.Application.Tests;

public sealed class MeTests
{
    private readonly FakeStore _store = new();

    private Me Sut() => new(_store, _store, _store);

    [Fact]
    public async Task Get_returns_the_current_users_profile()
    {
        var user = _store.SignIn(isDemo: true);

        var me = await Sut().GetAsync();

        me.Should().Be(new MeDto(user.Id, "Test", "Australia/Sydney", "AUD", IsDemo: true, CycleLengthDays: 30));
    }

    [Fact]
    public async Task Get_for_an_unknown_user_is_not_found()
    {
        _store.Id = Guid.NewGuid();

        (await Sut().Invoking(s => s.GetAsync()).Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("user.not-found");
    }

    [Fact]
    public async Task Update_changes_only_what_it_is_given()
    {
        _store.SignIn();

        var renamed = await Sut().UpdateAsync(new UpdateMeRequest(" Ricky ", null));
        var moved = await Sut().UpdateAsync(new UpdateMeRequest(null, "Europe/London"));

        renamed.Should().BeEquivalentTo(new { DisplayName = "Ricky", TimeZone = "Australia/Sydney" });
        moved.Should().BeEquivalentTo(new { DisplayName = "Ricky", TimeZone = "Europe/London" });
        _store.Saves.Should().Be(2);
    }

    [Fact]
    public async Task Update_rejects_an_empty_request_a_blank_name_and_an_unknown_time_zone()
    {
        _store.SignIn();
        var sut = Sut();

        await sut.Invoking(s => s.UpdateAsync(new UpdateMeRequest(null, null))).Should().ThrowAsync<ValidationException>();
        await sut.Invoking(s => s.UpdateAsync(new UpdateMeRequest("  ", null))).Should().ThrowAsync<ValidationException>();
        await sut.Invoking(s => s.UpdateAsync(new UpdateMeRequest(new string('x', 101), null))).Should().ThrowAsync<ValidationException>();
        (await sut.Invoking(s => s.UpdateAsync(new UpdateMeRequest(null, "Mars/Olympus_Mons"))).Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("user.timezone.unknown");
        _store.Saves.Should().Be(0);
    }

    [Fact]
    public async Task The_shared_demo_profile_is_read_only()
    {
        _store.SignIn(isDemo: true);

        var update = () => Sut().UpdateAsync(new UpdateMeRequest("Someone rude", null));

        (await update.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("demo.profile.readonly");
    }
}
