namespace Budget.Domain;

// The one place the plans are written down (launch plan D3). The server enforces these numbers, GET /api/me reports
// them to the SPA so it can draw locks, and GET /api/plans gives them to the public pricing page, so the price list
// can never promise something the server refuses.
//
// "Reports" means GET /api/reports/cycles, the answer the Cycles page draws its trend chart and list from. Free sees
// every cycle that is not over, plus the most recent one that is; older past cycles are left out of that answer, never
// deleted, and are still in the data export. With at most two cycles of history the cross-cycle trend has nothing to
// show, so the SPA locks the chart rather than drawing two dots.
public static class Plans
{
    public static readonly PlanLimits Free = new(MaxCategoriesPerCycle: 6, PastCyclesInReports: 1, TrendChart: false);
    public static readonly PlanLimits Premium = new(MaxCategoriesPerCycle: null, PastCyclesInReports: null, TrendChart: true);

    // For display only: the stores charge. Australian dollars, GST included.
    public const string PriceCurrency = "AUD";
    public const decimal PremiumMonthlyPrice = 3.99m;
    public const decimal PremiumYearlyPrice = 29.99m;
    public const int TrialDays = 14;

    // How long a subscription keeps Premium after its period or trial ends without the store saying it renewed:
    // a failed renewal (past due) or a notification that arrives late.
    public static readonly TimeSpan Grace = TimeSpan.FromDays(3);

    public static PlanLimits LimitsFor(Plan plan) => plan == Plan.Premium ? Premium : Free;
}
