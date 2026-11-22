using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Budget.Domain;

namespace Budget.Application.Tests;

public sealed class ExportCsvTests
{
    [Theory]
    [InlineData("Groceries", "Groceries")]
    [InlineData("Fish, chips", "\"Fish, chips\"")]
    [InlineData("The \"good\" stuff", "\"The \"\"good\"\" stuff\"")]
    [InlineData("two\nlines", "\"two\nlines\"")]
    [InlineData("two\r\nlines", "\"two\r\nlines\"")]
    [InlineData("café ☕", "café ☕")]
    [InlineData("", "")]
    [InlineData(null, "")]
    public void Text_is_quoted_per_rfc_4180(string? value, string expected) => ExportCsv.Text(value).Should().Be(expected);

    // OWASP's CSV injection list: a spreadsheet would run any of these as a formula.
    [Theory]
    [InlineData("=1+1", "'=1+1")]
    [InlineData("+61 400 000 000", "'+61 400 000 000")]
    [InlineData("-5 refund", "'-5 refund")]
    [InlineData("@SUM(A1:A2)", "'@SUM(A1:A2)")]
    [InlineData("\tindented", "'\tindented")]
    [InlineData("\rreturn", "\"'\rreturn\"")]
    [InlineData("=HYPERLINK(\"http://x\",\"a,b\")", "\"'=HYPERLINK(\"\"http://x\"\",\"\"a,b\"\")\"")]
    [InlineData("a=b", "a=b")]
    public void Text_that_starts_like_a_formula_is_prefixed_with_a_quote_mark(string value, string expected) =>
        ExportCsv.Text(value).Should().Be(expected);

    // A negative amount is a reversal, not text: it stays a number the spreadsheet can add up.
    [Theory]
    [InlineData("42", "42.00")]
    [InlineData("-5.5", "-5.50")]
    [InlineData("1234567.89", "1234567.89")]
    [InlineData("0", "0.00")]
    public void Amounts_are_plain_invariant_decimals_and_never_guarded(string value, string expected)
    {
        var previous = CultureInfo.CurrentCulture;
        CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("de-DE");
        try
        {
            ExportCsv.Amount(decimal.Parse(value, CultureInfo.InvariantCulture)).Should().Be(expected);
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }

    [Fact]
    public void A_missing_amount_is_an_empty_cell() => ExportCsv.Amount(null).Should().BeEmpty();

    [Fact]
    public void Dates_and_timestamps_are_iso_8601()
    {
        ExportCsv.Date(new DateOnly(2026, 3, 7)).Should().Be("2026-03-07");
        ExportCsv.Timestamp(new DateTimeOffset(2026, 3, 7, 9, 5, 1, TimeSpan.FromHours(10))).Should().Be("2026-03-06T23:05:01Z");
        ExportCsv.Number(12).Should().Be("12");
        ExportCsv.Flag(true).Should().Be("true");
        ExportCsv.Flag(false).Should().Be("false");
    }

    [Fact]
    public void Rows_end_in_crlf()
    {
        var writer = new StringWriter();

        ExportCsv.WriteRow(writer, "a", "b");
        ExportCsv.WriteRow(writer, "c", "");

        writer.ToString().Should().Be("a,b\r\nc,\r\n");
    }
}

public sealed class ExportDataTests
{
    // 1 Feb 2026, 15:00 UTC: already 2 Feb in Sydney.
    private static readonly DateTimeOffset Now = new(2026, 2, 1, 15, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Jan1 = new(2026, 1, 1);
    private readonly FakeStore _store = new();

    private ExportData Export() => new(_store, _store, _store, _store, _store, new FixedClock(Now));

    private sealed record Seeded(Cycle First, Cycle Second, Category Food, Category Pay, Transaction Lunch, Transaction Refund, Transaction Salary);

    private Seeded Seed(User user)
    {
        var first = new Cycle(user.Id, Jan1);
        first.Confirm();
        var second = first.CreateNext();
        var food = new Category(user.Id, CategoryType.Debit, Now);
        var pay = new Category(user.Id, CategoryType.Credit, Now);
        _store.Cycles.AddRange([second, first]);
        _store.Categories.AddRange([food, pay]);
        _store.CycleCategories.AddRange(
        [
            new CycleCategory(first, food.Id, "Food", "utensils", "blue", 1, 400m),
            new CycleCategory(first, pay.Id, "Salary", "wallet", "teal", 0, 5000m, spreadEvenly: false),
            new CycleCategory(second, food.Id, "Groceries", "shopping-cart", "blue", 0, 450m),
        ]);

        var lunch = new Transaction(first, food.Id, 12.5m, Jan1.AddDays(2), "=lunch", Guid.NewGuid(), Now.AddHours(-3));
        var refund = new Transaction(first, food.Id, -2.5m, Jan1.AddDays(2), null, Guid.NewGuid(), Now.AddHours(-2));
        var salary = new Transaction(first, pay.Id, 5000m, Jan1, "Pay", Guid.NewGuid(), Now.AddHours(-1));
        _store.Transactions.AddRange([refund, lunch, salary]);
        return new Seeded(first, second, food, pay, lunch, refund, salary);
    }

    [Fact]
    public async Task Every_cycle_with_its_categories_and_transactions_oldest_first()
    {
        var user = _store.SignIn();
        var s = Seed(user);

        var export = await Export().GetAsync();

        export.Cycles.Select(c => c.Id).Should().Equal(s.First.Id, s.Second.Id);
        var first = export.Cycles[0];
        first.Status.Should().Be(CycleStatus.Confirmed);
        first.EndDate.Should().Be(new DateOnly(2026, 1, 30));
        first.Categories.Select(c => c.Name).Should().Equal("Salary", "Food");
        first.Categories[0].Should().Be(new CycleCategoryExport(s.Pay.Id, "Salary", CategoryType.Credit, 5000m, "wallet", "teal", 0, false, false));
        first.Transactions.Select(t => t.Id).Should().Equal(s.Salary.Id, s.Lunch.Id, s.Refund.Id);
        first.Transactions[1].Should().Be(new TransactionExport(
            s.Lunch.Id, Jan1.AddDays(2), s.Food.Id, "Food", CategoryType.Debit, 12.5m, "=lunch", Now.AddHours(-3), Now.AddHours(-3)));
        first.Transactions[2].Amount.Should().Be(-2.5m);
        export.Cycles[1].Categories.Single().Name.Should().Be("Groceries");
        export.Cycles[1].Transactions.Should().BeEmpty();
    }

    // A rename in a later cycle never rewrites what an earlier transaction was filed under.
    [Fact]
    public async Task A_transaction_carries_its_own_cycles_category_name()
    {
        var user = _store.SignIn();
        var s = Seed(user);
        _store.Transactions.Add(new Transaction(s.Second, s.Food.Id, 30m, s.Second.StartDate, null, Guid.NewGuid(), Now));

        var export = await Export().GetAsync();

        export.Cycles[0].Transactions.Single(t => t.Id == s.Lunch.Id).Category.Should().Be("Food");
        export.Cycles[1].Transactions.Single().Category.Should().Be("Groceries");
    }

    [Fact]
    public async Task Only_the_current_users_rows_are_exported()
    {
        var other = _store.SignIn();
        var theirs = Seed(other);
        var user = _store.SignIn();
        var mine = Seed(user);

        var export = await Export().GetAsync();

        export.Cycles.Select(c => c.Id).Should().Equal(mine.First.Id, mine.Second.Id);
        var ids = export.Cycles.SelectMany(c => c.Transactions.Select(t => t.Id).Concat(c.Categories.Select(k => k.CategoryId))).ToList();
        ids.Should().NotContain([theirs.Lunch.Id, theirs.Refund.Id, theirs.Salary.Id, theirs.Food.Id, theirs.Pay.Id]);
        export.Profile.Should().Be(new ProfileExport("Test", null, "Australia/Sydney", "AUD", false, DateTimeOffset.UnixEpoch));
    }

    [Fact]
    public async Task The_file_is_named_with_the_users_today_and_stamped_with_now()
    {
        _store.SignIn("Australia/Sydney");

        var export = await Export().GetAsync();

        export.ExportedOn.Should().Be(new DateOnly(2026, 2, 2));
        export.ExportedAt.Should().Be(Now);
        export.FileName.Should().Be("tightarse-export-2026-02-02.zip");
    }

    [Fact]
    public async Task The_demo_user_is_exported_like_anyone_else()
    {
        var demo = _store.SignIn(isDemo: true);
        Seed(demo);

        var export = await Export().GetAsync();

        export.Profile.IsDemo.Should().BeTrue();
        export.Cycles.Should().HaveCount(2);
    }

    [Fact]
    public async Task A_user_with_nothing_yet_gets_an_empty_export()
    {
        _store.SignIn();

        (await Export().GetAsync()).Cycles.Should().BeEmpty();
    }

    [Fact]
    public async Task Nobody_signed_in_is_not_found()
    {
        await Export().Invoking(e => e.GetAsync()).Should().ThrowAsync<NotFoundException>();
    }
}

public sealed class ExportArchiveTests
{
    private static readonly DateTimeOffset At = new(2026, 2, 1, 15, 0, 0, TimeSpan.Zero);
    private static readonly Guid Food = Guid.NewGuid();
    private static readonly Guid Spent = Guid.NewGuid();

    private static UserExport Sample() => new(
        new DateOnly(2026, 2, 2),
        At,
        new ProfileExport("Ricky, \"R\"", "r@example.com", "Australia/Sydney", "AUD", false, At.AddDays(-30)),
        [
            new CycleExport(
                Guid.NewGuid(),
                new DateOnly(2026, 1, 1),
                new DateOnly(2026, 1, 30),
                CycleStatus.Confirmed,
                1000m,
                null,
                [new CycleCategoryExport(Food, "=Food", CategoryType.Debit, 400m, "utensils", "blue", 0, true, false)],
                [
                    new TransactionExport(Spent, new DateOnly(2026, 1, 3), Food, "=Food", CategoryType.Debit, 12.5m, "fish, chips", At, At),
                    new TransactionExport(Guid.NewGuid(), new DateOnly(2026, 1, 4), Food, "=Food", CategoryType.Debit, -2.5m, "-refund", At, At),
                ]),
        ]);

    private static Dictionary<string, byte[]> Unzip(UserExport export)
    {
        using var buffer = new MemoryStream();
        ExportArchive.Write(export, buffer);
        buffer.Position = 0;
        using var zip = new ZipArchive(buffer, ZipArchiveMode.Read);
        return zip.Entries.ToDictionary(e => e.FullName, e =>
        {
            using var stream = e.Open();
            using var copy = new MemoryStream();
            stream.CopyTo(copy);
            return copy.ToArray();
        });
    }

    private static readonly byte[] Bom = [0xEF, 0xBB, 0xBF];

    private static string Csv(byte[] bytes)
    {
        bytes.Take(3).Should().Equal(Bom, "Excel reads a CSV as UTF-8 only when it starts with the byte order mark");
        return Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
    }

    [Fact]
    public void The_archive_holds_the_four_csvs_and_the_json()
    {
        Unzip(Sample()).Keys.Should().BeEquivalentTo("profile.csv", "cycles.csv", "categories.csv", "transactions.csv", "export.json");
        ExportArchive.EntryNames.Should().BeEquivalentTo(Unzip(Sample()).Keys);
    }

    [Fact]
    public void Each_csv_has_a_header_then_one_row_per_record_in_crlf_lines()
    {
        var files = Unzip(Sample());

        Csv(files["profile.csv"]).Should().Be(
            "Display name,Email,Time zone,Currency,Demo,Created at\r\n" +
            "\"Ricky, \"\"R\"\"\",r@example.com,Australia/Sydney,AUD,false,2026-01-02T15:00:00Z\r\n");
        Csv(files["cycles.csv"]).Should().Be(
            "Start date,End date,Status,Opening balance,Closing balance\r\n" +
            "2026-01-01,2026-01-30,Confirmed,1000.00,\r\n");
        Csv(files["categories.csv"]).Should().Be(
            "Cycle start,Name,Type,Budget,Icon,Colour,Order,Spread evenly,Auto-pay\r\n" +
            "2026-01-01,'=Food,Debit,400.00,utensils,blue,0,true,false\r\n");
        Csv(files["transactions.csv"]).Should().Be(
            "Date,Cycle start,Category,Type,Amount,Note,Created at\r\n" +
            "2026-01-03,2026-01-01,'=Food,Debit,12.50,\"fish, chips\",2026-02-01T15:00:00Z\r\n" +
            "2026-01-04,2026-01-01,'=Food,Debit,-2.50,'-refund,2026-02-01T15:00:00Z\r\n");
    }

    [Fact]
    public void The_json_holds_everything_with_iso_dates_plain_numbers_and_unguarded_text()
    {
        var bytes = Unzip(Sample())["export.json"];
        bytes.Take(3).Should().NotEqual(Bom);

        using var json = JsonDocument.Parse(bytes);
        var root = json.RootElement;
        root.GetProperty("format").GetString().Should().Be("tightarse-export");
        root.GetProperty("version").GetInt32().Should().Be(1);
        root.GetProperty("exportedOn").GetString().Should().Be("2026-02-02");
        root.GetProperty("profile").GetProperty("email").GetString().Should().Be("r@example.com");

        var cycle = root.GetProperty("cycles")[0];
        cycle.GetProperty("startDate").GetString().Should().Be("2026-01-01");
        cycle.GetProperty("status").GetString().Should().Be("Confirmed");
        cycle.GetProperty("openingBalance").GetDecimal().Should().Be(1000m);
        cycle.GetProperty("closingBalance").ValueKind.Should().Be(JsonValueKind.Null);
        cycle.GetProperty("categories")[0].GetProperty("name").GetString().Should().Be("=Food");
        cycle.GetProperty("categories")[0].GetProperty("type").GetString().Should().Be("Debit");

        var refund = cycle.GetProperty("transactions")[1];
        refund.GetProperty("amount").GetDecimal().Should().Be(-2.5m);
        refund.GetProperty("note").GetString().Should().Be("-refund");
        refund.GetProperty("date").GetString().Should().Be("2026-01-04");
        cycle.GetProperty("transactions")[0].GetProperty("id").GetGuid().Should().Be(Spent);
    }

    [Fact]
    public void The_destination_is_left_open_for_the_caller()
    {
        using var buffer = new MemoryStream();

        ExportArchive.Write(Sample(), buffer);

        buffer.CanRead.Should().BeTrue();
        buffer.Length.Should().BeGreaterThan(0);
    }
}
