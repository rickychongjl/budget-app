namespace Budget.Domain;

public sealed class Cycle
{
    public const int LengthInDays = 30;

    public Cycle(Guid userId, DateOnly startDate)
    {
        UserId = userId;
        StartDate = startDate;
    }

    public Guid Id { get; } = Guid.NewGuid();
    public Guid UserId { get; }
    public DateOnly StartDate { get; private set; }
    public DateOnly EndDate => StartDate.AddDays(LengthInDays - 1);
    public CycleStatus Status { get; private set; } = CycleStatus.Draft;
    public decimal? OpeningBalance { get; private set; }
    public decimal? ClosingBalance { get; private set; }

    public void Confirm() => Status = CycleStatus.Confirmed;

    public bool Covers(DateOnly date) => date >= StartDate && date <= EndDate;

    // Internal: dates and balances are changed through CycleTimeline, which knows whether the cycle is editable.
    internal void MoveTo(DateOnly startDate) => StartDate = startDate;

    internal void SetOpeningBalance(decimal? value) => OpeningBalance = value;

    internal void SetClosingBalance(decimal value) => ClosingBalance = value;

    public Cycle CreateNext()
    {
        if (Status == CycleStatus.Draft)
        {
            throw new DomainException("cycle.draft", "A draft cycle must be confirmed before the next cycle can follow it.");
        }

        return new Cycle(UserId, StartDate.AddDays(LengthInDays))
        {
            Status = CycleStatus.Confirmed,
            OpeningBalance = ClosingBalance,
        };
    }
}
