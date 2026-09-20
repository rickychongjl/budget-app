using System.Text.Json;
using System.Text.Json.Serialization;
using Budget.Domain;

namespace Budget.Application;

// The shape of demo-seed.json. Dates are day offsets from today, so the same file always gives a current cycle with history.
public sealed record DemoFixture(
    int FirstCycleStartOffset,
    decimal OpeningBalance,
    IReadOnlyList<decimal> ClosingBalances,
    IReadOnlyList<DemoFixture.CategorySeed> Categories,
    IReadOnlyList<DemoFixture.TransactionSeed> Transactions)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    public static DemoFixture Parse(string json) =>
        JsonSerializer.Deserialize<DemoFixture>(json, Json) ?? throw new JsonException("The demo fixture is empty.");

    public sealed record CategorySeed(string Key, CategoryType Type, string Name, string Icon, string Colour, decimal Budget);

    // A transaction lands in whichever cycle covers its day.
    public sealed record TransactionSeed(string Category, int DayOffset, decimal Amount, string? Note);
}
