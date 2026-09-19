using System.Reflection;

namespace Budget.Domain.Tests;

public class ArchitectureTests
{
    [Fact]
    public void Domain_references_nothing_outward()
    {
        var references = Assembly.Load("Budget.Domain").GetReferencedAssemblies();

        Assert.DoesNotContain(references, r =>
            r.Name!.StartsWith("Budget.") || r.Name.StartsWith("Microsoft.EntityFrameworkCore"));
    }
}
