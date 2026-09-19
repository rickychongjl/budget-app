using Budget.Application;
using Budget.Domain;
using Microsoft.EntityFrameworkCore;

namespace Budget.Infrastructure;

public sealed class BudgetDbContext(DbContextOptions<BudgetDbContext> options, ICurrentUser currentUser)
    : DbContext(options), IUnitOfWork
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Cycle> Cycles => Set<Cycle>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<CycleCategory> CycleCategories => Set<CycleCategory>();
    public DbSet<Transaction> Transactions => Set<Transaction>();

    // A property, not the constructor parameter, so EF re-reads it per query instead of baking one user into the cached model.
    private Guid CurrentUserId => currentUser.Id;

    protected override void ConfigureConventions(ModelConfigurationBuilder configuration) =>
        configuration.Properties<decimal>().HavePrecision(18, 2);

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        EnforceTenant();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        EnforceTenant();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    // The query filter covers reads. This covers writes: every tenant row that is inserted, updated or deleted
    // must belong to the current user, including rows attached by hand rather than loaded through the filter.
    private void EnforceTenant()
    {
        var entries = ChangeTracker.Entries()
            .Where(e => e.Entity is not User && e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted);

        foreach (var entry in entries)
        {
            var userId = entry.Property(nameof(Cycle.UserId));
            if (entry.State == EntityState.Added && (Guid)userId.CurrentValue! == Guid.Empty)
            {
                userId.CurrentValue = CurrentUserId;
            }

            if (CurrentUserId == Guid.Empty || (Guid)userId.CurrentValue! != CurrentUserId || (Guid)userId.OriginalValue! != CurrentUserId)
            {
                throw new InvalidOperationException($"{entry.Metadata.DisplayName()} does not belong to the current user.");
            }
        }
    }

    // The domain entities have no setters for identity fields and create their own Guid keys,
    // so every get-only property is mapped explicitly (EF writes the backing field) and no key is store-generated.
    // Foreign keys carry UserId, so the database itself refuses a row that points at another user's parent.
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<User>(b =>
        {
            b.ToTable("User");
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.ExternalId).HasMaxLength(64);
            b.Property(x => x.DisplayName).HasMaxLength(100);
            b.Property(x => x.IsDemo);
            b.Property(x => x.TimeZone).HasMaxLength(64);
            b.Property(x => x.Currency).HasMaxLength(3);
            b.Property(x => x.CreatedAt);
            b.HasIndex(x => x.ExternalId).IsUnique();
        });

        model.Entity<Cycle>(b =>
        {
            b.ToTable("Cycle");
            b.HasQueryFilter(x => x.UserId == CurrentUserId);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.UserId);
            b.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.UserId, x.StartDate }).IsUnique();
        });

        model.Entity<Category>(b =>
        {
            b.ToTable("Category");
            b.HasQueryFilter(x => x.UserId == CurrentUserId);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.UserId);
            b.Property(x => x.Type);
            b.Property(x => x.CreatedAt);
            b.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<CycleCategory>(b =>
        {
            b.ToTable("CycleCategory");
            b.HasQueryFilter(x => x.UserId == CurrentUserId);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.UserId);
            b.Property(x => x.CycleId);
            b.Property(x => x.CategoryId);
            b.Property(x => x.Name).HasMaxLength(60);
            b.Property(x => x.Icon).HasMaxLength(40);
            b.Property(x => x.Colour).HasMaxLength(20);
            b.HasOne<Cycle>().WithMany()
                .HasForeignKey(x => new { x.UserId, x.CycleId }).HasPrincipalKey(x => new { x.UserId, x.Id })
                .OnDelete(DeleteBehavior.Restrict);
            b.HasOne<Category>().WithMany()
                .HasForeignKey(x => new { x.UserId, x.CategoryId }).HasPrincipalKey(x => new { x.UserId, x.Id })
                .OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<Transaction>(b =>
        {
            b.ToTable("Transaction");
            b.HasQueryFilter(x => x.UserId == CurrentUserId);
            b.Property(x => x.Id).ValueGeneratedNever();
            b.Property(x => x.UserId);
            b.Property(x => x.CycleId);
            b.Property(x => x.ClientId);
            b.Property(x => x.CreatedAt);
            b.Property(x => x.Note).HasMaxLength(280);

            // One key does three jobs: the category must be in the transaction's cycle, a CycleCategory
            // with transactions cannot be removed, and the index serves "transactions for this cycle and category".
            b.HasOne<CycleCategory>().WithMany()
                .HasForeignKey(x => new { x.UserId, x.CycleId, x.CategoryId })
                .HasPrincipalKey(x => new { x.UserId, x.CycleId, x.CategoryId })
                .OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.UserId, x.OccurredOn });
            b.HasIndex(x => new { x.UserId, x.ClientId }).IsUnique();
        });
    }
}
