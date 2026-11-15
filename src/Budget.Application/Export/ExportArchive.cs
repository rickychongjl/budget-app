using System.IO.Compression;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Budget.Application;

// The downloadable ZIP: a CSV per table for spreadsheets, and export.json with everything in one document. Rows are written
// straight into each entry, so no file is ever held as one big string. CSVs are UTF-8 with a byte order mark, which is what
// makes Excel read them as UTF-8; the JSON has none, as JSON readers expect.
public static class ExportArchive
{
    public const string ContentType = "application/zip";
    public const string JsonFormat = "tightarse-export";
    public const int JsonVersion = 1;

    public static readonly IReadOnlyList<string> EntryNames = ["profile.csv", "cycles.csv", "categories.csv", "transactions.csv", "export.json"];

    private static readonly UTF8Encoding CsvEncoding = new(encoderShouldEmitUTF8Identifier: true);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        // A file to read, never HTML: keep "café" and quotes as themselves instead of \u00E9 and \u0022.
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        Converters = { new JsonStringEnumConverter() },
    };

    private sealed record JsonDocumentRoot(
        string Format, int Version, DateOnly ExportedOn, DateTimeOffset ExportedAt, ProfileExport Profile, IReadOnlyList<CycleExport> Cycles);

    // Leaves the destination open: the caller owns it.
    public static void Write(UserExport export, Stream destination)
    {
        using var zip = new ZipArchive(destination, ZipArchiveMode.Create, leaveOpen: true);

        Csv(zip, "profile.csv", writer =>
        {
            ExportCsv.WriteRow(writer, "Display name", "Email", "Time zone", "Currency", "Demo", "Created at");
            var p = export.Profile;
            ExportCsv.WriteRow(
                writer, ExportCsv.Text(p.DisplayName), ExportCsv.Text(p.Email), ExportCsv.Text(p.TimeZone), ExportCsv.Text(p.Currency), ExportCsv.Flag(p.IsDemo), ExportCsv.Timestamp(p.CreatedAt));
        });

        Csv(zip, "cycles.csv", writer =>
        {
            ExportCsv.WriteRow(writer, "Start date", "End date", "Status", "Opening balance", "Closing balance");
            foreach (var c in export.Cycles)
            {
                ExportCsv.WriteRow(
                    writer, ExportCsv.Date(c.StartDate), ExportCsv.Date(c.EndDate), c.Status.ToString(), ExportCsv.Amount(c.OpeningBalance), ExportCsv.Amount(c.ClosingBalance));
            }
        });

        Csv(zip, "categories.csv", writer =>
        {
            ExportCsv.WriteRow(writer, "Cycle start", "Name", "Type", "Budget", "Icon", "Colour", "Order", "Spread evenly");
            foreach (var c in export.Cycles)
            {
                foreach (var s in c.Categories)
                {
                    ExportCsv.WriteRow(
                        writer,
                        ExportCsv.Date(c.StartDate),
                        ExportCsv.Text(s.Name),
                        s.Type.ToString(),
                        ExportCsv.Amount(s.Budget),
                        ExportCsv.Text(s.Icon),
                        ExportCsv.Text(s.Colour),
                        ExportCsv.Number(s.Order),
                        ExportCsv.Flag(s.SpreadEvenly));
                }
            }
        });

        Csv(zip, "transactions.csv", writer =>
        {
            ExportCsv.WriteRow(writer, "Date", "Cycle start", "Category", "Type", "Amount", "Note", "Created at");
            foreach (var c in export.Cycles)
            {
                foreach (var t in c.Transactions)
                {
                    ExportCsv.WriteRow(
                        writer,
                        ExportCsv.Date(t.Date),
                        ExportCsv.Date(c.StartDate),
                        ExportCsv.Text(t.Category),
                        t.Type.ToString(),
                        ExportCsv.Amount(t.Amount),
                        ExportCsv.Text(t.Note),
                        ExportCsv.Timestamp(t.CreatedAt));
                }
            }
        });

        // Values exactly as stored: no formula guard here, because nothing reads JSON as a spreadsheet.
        using var json = Entry(zip, "export.json");
        JsonSerializer.Serialize(
            json, new JsonDocumentRoot(JsonFormat, JsonVersion, export.ExportedOn, export.ExportedAt, export.Profile, export.Cycles), Json);
    }

    private static void Csv(ZipArchive zip, string name, Action<TextWriter> write)
    {
        using var writer = new StreamWriter(Entry(zip, name), CsvEncoding);
        write(writer);
    }

    private static Stream Entry(ZipArchive zip, string name)
    {
        var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
        // ZIP stores local DOS time; the moment of export is written in export.json instead.
        return entry.Open();
    }
}
