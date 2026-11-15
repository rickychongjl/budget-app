using System.Text.Json.Nodes;

namespace Budget.Api.Tests;

// The public pages (src/web/src/features/public) render signed out and offline, so they read copies kept in the SPA
// rather than asking the server or reading docs/ (the image builds the SPA from src/web alone). These keep the copies
// honest: the price list can never promise what Plans does not enforce, and the legal pages always say what
// docs/legal says.
[Collection(ApiCollection.Name)]
public sealed class PublicPagesTests(ApiFactory api)
{
    private static readonly string Public = Path.Combine("src", "web", "src", "features", "public");

    private static string RepoFile(string relative)
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, relative);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        throw new FileNotFoundException($"{relative} was not found above {AppContext.BaseDirectory}.");
    }

    [Fact]
    public async Task The_pricing_pages_copy_of_the_plans_matches_what_the_server_serves()
    {
        var served = JsonNode.Parse(await api.CreateClient().GetStringAsync("/api/plans"));
        var copy = JsonNode.Parse(await File.ReadAllTextAsync(RepoFile(Path.Combine(Public, "plans.json"))));

        JsonNode.DeepEquals(served, copy).Should().BeTrue(
            "{0} must equal GET /api/plans, which serves {1}", Path.Combine(Public, "plans.json"), served!.ToJsonString());
    }

    // After editing docs/legal, copy the file over without its notes for Ricky: everything above the "Claims and where they
    // are true" heading and the rule before it. Those notes name weak spots in the setup, so they never ship in the bundle.
    [Theory]
    [InlineData("privacy.md")]
    [InlineData("terms.md")]
    public async Task The_legal_pages_publish_docs_legal_word_for_word_up_to_the_notes(string file)
    {
        var published = await File.ReadAllTextAsync(RepoFile(Path.Combine(Public, "legal", file)));
        var source = await File.ReadAllTextAsync(RepoFile(Path.Combine("docs", "legal", file)));

        published.ReplaceLineEndings("\n").Should().Be(Publishable(source), "{0} is docs/legal/{1} up to the notes", Path.Combine(Public, "legal", file), file);
    }

    private static string Publishable(string markdown)
    {
        var lines = markdown.ReplaceLineEndings("\n").Split('\n').ToList();
        var end = lines.FindIndex(line => line.StartsWith('#') && line.TrimStart('#').Trim() == "Claims and where they are true");
        var kept = end < 0 ? lines : lines[..end];
        while (kept.Count > 0 && (kept[^1].Trim().Length == 0 || IsRule(kept[^1].Trim())))
        {
            kept.RemoveAt(kept.Count - 1);
        }

        return string.Join('\n', kept) + "\n";
    }

    private static bool IsRule(string line) => line.Length >= 3 && line.All(c => c == '-');
}
