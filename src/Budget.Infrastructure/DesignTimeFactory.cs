using Budget.Application;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Budget.Infrastructure;

// Lets `dotnet ef migrations add` build the model without a host, a database or a user.
internal sealed class DesignTimeFactory : IDesignTimeDbContextFactory<BudgetDbContext>
{
    public BudgetDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<BudgetDbContext>().UseSqlServer().Options, new Nobody());

    private sealed class Nobody : ICurrentUser
    {
        public Guid Id => Guid.Empty;
    }
}
