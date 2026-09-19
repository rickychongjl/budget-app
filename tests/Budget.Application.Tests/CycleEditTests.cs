using Budget.Domain;
using FluentValidation;

namespace Budget.Application.Tests;

public sealed class CycleEditTests
{
    private static readonly DateOnly Jan1 = new(2026, 1, 1);
    private readonly FakeStore _store = new();

    // 10 Feb 2026 in Sydney: a chain from 1 Jan has a past cycle, a current one (31 Jan) and any futures.
    private Cycles Sut()
    {
        var today = new UserToday(_store, _store, new FixedClock(new DateTimeOffset(2026, 2, 10, 1, 0, 0, TimeSpan.Zero)));
        return new Cycles(_store, _store, _store, _store, _store, today, new RolloverCycles(_store, _store, today, _store), new ListLogger<Cycles>());
    }

    private (Cycle Past, Cycle Current, Cycle Future) Chain()
    {
        var past = new Cycle(_store.SignIn().Id, Jan1);
        past.Confirm();
        var current = past.CreateNext();
        var future = current.CreateNext();
        _store.Cycles.AddRange([past, current, future]);
        return (past, current, future);
    }

    [Fact]
    public async Task Create_makes_the_first_cycle_a_draft_with_its_opening_balance()
    {
        var user = _store.SignIn();

        var dto = await Sut().CreateFirstAsync(new CreateCycleRequest(new DateOnly(2026, 2, 1), 1234.56m));

        var cycle = _store.Cycles.Should().ContainSingle().Subject;
        cycle.UserId.Should().Be(user.Id);
        dto.Should().Be(new CycleDto(cycle.Id, new DateOnly(2026, 2, 1), new DateOnly(2026, 3, 2), CycleStatus.Draft, CyclePhase.Current, 1234.56m, null));
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task Create_is_onboarding_only()
    {
        Chain();

        var create = () => Sut().CreateFirstAsync(new CreateCycleRequest(new DateOnly(2026, 6, 1), null));

        (await create.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("cycle.exists");
    }

    [Fact]
    public async Task Create_needs_a_start_date()
    {
        _store.SignIn();

        var create = () => Sut().CreateFirstAsync(new CreateCycleRequest(default, null));

        (await create.Should().ThrowAsync<ValidationException>()).Which.Errors.Should().ContainSingle(e => e.PropertyName == "StartDate");
    }

    [Fact]
    public async Task Confirm_turns_the_draft_into_a_confirmed_cycle()
    {
        var draft = new Cycle(_store.SignIn().Id, new DateOnly(2026, 2, 1));
        _store.Cycles.Add(draft);

        var dto = await Sut().ConfirmAsync(draft.Id);

        dto.Status.Should().Be(CycleStatus.Confirmed);
        draft.Status.Should().Be(CycleStatus.Confirmed);
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task Moving_the_current_start_shifts_the_future_cycles_and_saves_once()
    {
        var chain = Chain();

        var dto = await Sut().UpdateAsync(chain.Current.Id, new UpdateCycleRequest(new DateOnly(2026, 2, 5), null, null));

        dto.StartDate.Should().Be(new DateOnly(2026, 2, 5));
        chain.Future.StartDate.Should().Be(new DateOnly(2026, 3, 7));
        chain.Past.StartDate.Should().Be(Jan1);
        _store.Saves.Should().Be(1);
    }

    [Fact]
    public async Task A_past_cycles_opening_balance_is_read_only()
    {
        var chain = Chain();

        var update = () => Sut().UpdateAsync(chain.Past.Id, new UpdateCycleRequest(null, 10m, null));

        (await update.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("cycle.past.readonly");
        _store.Saves.Should().Be(0);
    }

    [Fact]
    public async Task A_past_cycles_closing_balance_is_editable_and_becomes_the_next_opening_balance()
    {
        var chain = Chain();

        var dto = await Sut().UpdateAsync(chain.Past.Id, new UpdateCycleRequest(null, null, 900m));

        dto.ClosingBalance.Should().Be(900m);
        chain.Current.OpeningBalance.Should().Be(900m);
    }

    [Fact]
    public async Task An_update_with_nothing_to_change_is_invalid()
    {
        var chain = Chain();

        var update = () => Sut().UpdateAsync(chain.Current.Id, new UpdateCycleRequest(null, null, null));

        await update.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task Confirming_or_updating_an_unknown_cycle_is_not_found()
    {
        _store.SignIn();
        var sut = Sut();

        (await sut.Invoking(s => s.ConfirmAsync(Guid.NewGuid())).Should().ThrowAsync<NotFoundException>()).Which.Code.Should().Be("cycle.not-found");
        (await sut.Invoking(s => s.UpdateAsync(Guid.NewGuid(), new UpdateCycleRequest(null, 1m, null))).Should().ThrowAsync<NotFoundException>())
            .Which.Code.Should().Be("cycle.not-found");
    }
}
