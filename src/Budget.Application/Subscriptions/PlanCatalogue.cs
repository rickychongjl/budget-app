using Budget.Domain;

namespace Budget.Application;

public sealed record PlanPriceDto(string Currency, decimal Monthly, decimal Yearly, int TrialDays);

// GET /api/plans: what the public pricing page prints, straight from Plans, so it says what the server enforces.
public sealed record PlanCatalogueDto(PlanLimits Free, PlanLimits Premium, PlanPriceDto PremiumPrice)
{
    public static readonly PlanCatalogueDto Current = new(
        Plans.Free,
        Plans.Premium,
        new PlanPriceDto(Plans.PriceCurrency, Plans.PremiumMonthlyPrice, Plans.PremiumYearlyPrice, Plans.TrialDays));
}
