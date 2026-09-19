namespace Budget.Domain;

// What a rollover created, for the caller to persist. Both lists are empty when nothing was due.
public sealed record RolloverResult(IReadOnlyList<Cycle> Cycles, IReadOnlyList<CycleCategory> Categories);
