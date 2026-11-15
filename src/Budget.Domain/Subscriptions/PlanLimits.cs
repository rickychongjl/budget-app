namespace Budget.Domain;

// What a plan allows. Null means no limit. Plans holds the two instances; nothing else may make one.
public sealed record PlanLimits(int? MaxCategoriesPerCycle, int? PastCyclesInReports, bool TrendChart);
