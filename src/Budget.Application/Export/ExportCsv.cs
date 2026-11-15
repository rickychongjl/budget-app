using System.Globalization;

namespace Budget.Application;

// One cell at a time, each already in its final CSV form. RFC 4180: comma separated, CRLF rows, a cell holding a comma, quote,
// CR or LF is quoted with its quotes doubled. Numbers and dates are invariant and never localised, so a file made on any
// server opens the same in Excel and Google Sheets in any locale.
public static class ExportCsv
{
    public const string NewLine = "\r\n";

    // Characters a spreadsheet reads as the start of a formula (OWASP's list for CSV injection).
    private static readonly char[] FormulaStarts = ['=', '+', '-', '@', '\t', '\r'];

    private static readonly char[] NeedsQuotes = [',', '"', '\r', '\n'];

    // Free text the user typed. A leading formula character gets a ' in front, so "=HYPERLINK(...)" in a note is shown, not run.
    // Only text is guarded: amounts are written by Amount, where a leading minus is a reversal and must stay a number.
    public static string Text(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return "";
        }

        if (Array.IndexOf(FormulaStarts, value[0]) >= 0)
        {
            value = "'" + value;
        }

        return value.IndexOfAny(NeedsQuotes) >= 0 ? $"\"{value.Replace("\"", "\"\"", StringComparison.Ordinal)}\"" : value;
    }

    // Plain decimal: two places, '.' as the separator, no grouping, a leading '-' for a reversal. Empty when there is none.
    public static string Amount(decimal? value) => value?.ToString("0.00", CultureInfo.InvariantCulture) ?? "";

    public static string Number(int value) => value.ToString(CultureInfo.InvariantCulture);

    public static string Date(DateOnly value) => value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    // ISO 8601 in UTC, to the second.
    public static string Timestamp(DateTimeOffset value) =>
        value.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);

    public static string Flag(bool value) => value ? "true" : "false";

    // Cells must already be encoded by the functions above.
    public static void WriteRow(TextWriter writer, params string[] cells)
    {
        writer.Write(string.Join(',', cells));
        writer.Write(NewLine);
    }
}
