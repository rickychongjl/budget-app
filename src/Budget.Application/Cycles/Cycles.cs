using Budget.Domain;
using FluentValidation;
using Microsoft.Extensions.Logging;

namespace Budget.Application;

public sealed record CycleDto(
    Guid Id,
    DateOnly StartDate,
    DateOnly EndDate,
    CycleStatus Status,
    CyclePhase Phase,
    decimal? OpeningBalance,
    decimal? ClosingBalance);

public sealed record CycleSummaryDto(CycleDto Cycle, CycleRollup Rollup);

public sealed class Cycles(
    ICurrentUser currentUser,
    IUnitOfWork unitOfWork,
    ICycleRepository cycles,
    ICategoryRepository categories,
    ITransactionRepository transactions,
    UserToday today,
    RolloverCycles rollover,
    ILogger<Cycles> logger)
{
    public async Task<IReadOnlyList<CycleDto>> ListAsync(CancellationToken ct = default)
    {
        var now = await today.GetAsync(ct);
        var timeline = new CycleTimeline(await cycles.ListAsync(ct));
        return [.. timeline.Cycles.Select(c => ToDto(c, timeline, now))];
    }

    public async Task<CycleSummaryDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var (cycle, timeline, now) = await FindAsync(id, ct);
        return await SummaryAsync(cycle, timeline, now, ct);
    }

    // The fallback rollover trigger: a late or failed job must never leave the app without a current cycle.
    public async Task<CycleSummaryDto> GetCurrentAsync(CancellationToken ct = default)
    {
        var created = await rollover.RunAsync(ct);
        if (created > 0)
        {
            logger.LogWarning("Rollover fallback created {Count} cycle(s) at request time; the rollover job is behind.", created);
        }

        var now = await today.GetAsync(ct);
        var timeline = new CycleTimeline(await cycles.ListAsync(ct));
        var current = timeline.Current(now) ?? throw new NotFoundException("cycle.none", "There is no current cycle yet.");
        return await SummaryAsync(current, timeline, now, ct);
    }

    // Onboarding only. Every later cycle comes from RolloverCycles.
    public async Task<CycleDto> CreateFirstAsync(CreateCycleRequest request, CancellationToken ct = default)
    {
        CreateCycleValidator.Instance.ValidateAndThrow(request);

        var now = await today.GetAsync(ct);
        // ponytail: two simultaneous first requests with different start dates would both pass this check.
        // One person onboarding once does not do that; a filtered unique index on Draft would close it.
        if ((await cycles.ListAsync(ct)).Count > 0)
        {
            throw new DomainException("cycle.exists", "The first cycle already exists; later cycles are created automatically.");
        }

        var cycle = new Cycle(currentUser.Id, request.StartDate);
        var timeline = new CycleTimeline([cycle]);
        if (request.OpeningBalance is { } opening)
        {
            timeline.SetOpeningBalance(cycle, opening, now);
        }

        cycles.Add(cycle);
        await unitOfWork.SaveChangesAsync(ct);
        return ToDto(cycle, timeline, now);
    }

    public async Task<CycleDto> ConfirmAsync(Guid id, CancellationToken ct = default)
    {
        var (cycle, timeline, now) = await FindAsync(id, ct);
        cycle.Confirm();
        await unitOfWork.SaveChangesAsync(ct);
        return ToDto(cycle, timeline, now);
    }

    public async Task<CycleDto> UpdateAsync(Guid id, UpdateCycleRequest request, CancellationToken ct = default)
    {
        UpdateCycleValidator.Instance.ValidateAndThrow(request);

        var (cycle, timeline, now) = await FindAsync(id, ct);
        if (request.StartDate is { } start)
        {
            timeline.MoveStart(cycle, start, now);
        }

        if (request.OpeningBalance is { } opening)
        {
            timeline.SetOpeningBalance(cycle, opening, now);
        }

        if (request.ClosingBalance is { } closing)
        {
            timeline.SetClosingBalance(cycle, closing, now);
        }

        await unitOfWork.SaveChangesAsync(ct);
        return ToDto(cycle, timeline, now);
    }

    private async Task<(Cycle Cycle, CycleTimeline Timeline, DateOnly Today)> FindAsync(Guid id, CancellationToken ct)
    {
        var now = await today.GetAsync(ct);
        var timeline = new CycleTimeline(await cycles.ListAsync(ct));
        var cycle = timeline.Cycles.SingleOrDefault(c => c.Id == id) ?? throw new NotFoundException("cycle.not-found", "Cycle not found.");
        return (cycle, timeline, now);
    }

    private async Task<CycleSummaryDto> SummaryAsync(Cycle cycle, CycleTimeline timeline, DateOnly now, CancellationToken ct)
    {
        var rollup = CycleRollup.Calculate(
            cycle,
            await categories.ListForCycleAsync(cycle.Id, ct),
            await categories.ListAsync(ct),
            await transactions.ListForCycleAsync(cycle.Id, null, ct));
        return new CycleSummaryDto(ToDto(cycle, timeline, now), rollup);
    }

    private static CycleDto ToDto(Cycle cycle, CycleTimeline timeline, DateOnly now) =>
        new(cycle.Id, cycle.StartDate, cycle.EndDate, cycle.Status, timeline.PhaseOf(cycle, now), cycle.OpeningBalance, cycle.ClosingBalance);
}
