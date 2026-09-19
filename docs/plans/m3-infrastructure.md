# M3 plan: Infrastructure (DbContext, migrations, repositories, tenant filter)

Source: `docs/solution-design.md` sections 2.3, 3.1, 3.3, 8 and section 17 item 3. No endpoints, no use cases, no UI.
Code lands in `src/Budget.Application` (interfaces only), `src/Budget.Infrastructure` and a new `tests/Budget.Infrastructure.Tests`, test first.

## Status: implemented

All five slices are in. 29 integration tests against a SQL Server 2022 container; Domain coverage is 98.65% after the two private constructors.

Where the code differs from the plan below:

- Entity mapping is one `OnModelCreating` in `BudgetDbContext.cs`, not an `IEntityTypeConfiguration<T>` per entity: the query filters need the context instance, and the whole model fits on one screen.
- Slices 1 to 3 landed as one commit, because there is no migration to test without a mapped model and the mapping tests cannot isolate themselves without the tenant filter.
- The five decisions at the bottom were implemented as written.

## Done when

- The initial migration applies to an empty SQL Server 2022 container and the model has no pending changes.
- Every entity round-trips through its repository with the domain rules intact (money precision, dates, enums, private state).
- User A cannot read, insert for, update or delete user B's rows through `BudgetDbContext`, and the database itself rejects a row that points at another user's parent.
- The five indexes in section 8 exist and the unique ones reject duplicates.
- `dotnet build -warnaserror` and `dotnet test` are green (Docker running). Domain coverage stays above 90%.
- Application still references neither EF Core nor Infrastructure (architecture test).

## Out of scope (and where it goes)

| Thing | Milestone |
|---|---|
| `RolloverCycles` and every other use case, FluentValidation, demo caps, `Budget.Application.Tests` with in-memory fakes | M4, with the endpoints that call them |
| `AddInfrastructure(...)` DI registration, the HTTP-backed `ICurrentUser`, connection string config | M4 (first consumer is `Budget.Api`) |
| `Budget.Jobs` entry points (`migrate`, `rollover`, `reset-demo`), per-user DI scope for the rollover job | M4 for `migrate` (compose `api` service needs it), M5/M9 for the rest |
| Tenant isolation through endpoints | M4 (`Budget.Api.Tests`) |
| Retry on the `Cycle (UserId, StartDate)` race | M4, inside `RolloverCycles`; M3 only proves the index rejects the duplicate |
| Seed and `fixtures/demo-seed.json` | M5 (demo session) |

## Application (interfaces only)

| Type | Members |
|---|---|
| `ICurrentUser` | `Guid Id` |
| `IUnitOfWork` | `SaveChangesAsync(ct)` |
| `IUserRepository` | `GetAsync(id)`, `GetByExternalIdAsync(externalId)`, `ListAsync()`, `Add(user)` |
| `ICycleRepository` | `ListAsync()` (ordered by `StartDate`; feeds `CycleTimeline`), `GetAsync(id)`, `Add(cycle)` |
| `ICategoryRepository` | `ListAsync()`, `GetAsync(id)`, `Add(category)`, `ListForCycleAsync(cycleId)`, `GetForCycleAsync(cycleId, categoryId)`, `Add(cycleCategory)`, `Remove(cycleCategory)` |
| `ITransactionRepository` | `ListForCycleAsync(cycleId, categoryId?)`, `GetAsync(id)`, `GetByClientIdAsync(clientId)`, `AnyForCategoryAsync(cycleId, categoryId)`, `Add(transaction)`, `Remove(transaction)` |

Each method maps to a route in section 4 or to rollover; nothing speculative. Report queries (M7) get their methods when they have a caller.

## Infrastructure

- `BudgetDbContext(options, ICurrentUser)`, implements `IUnitOfWork`. Four `DbSet`s plus `Users`.
- One `IEntityTypeConfiguration<T>` per entity, applied from the assembly.
- Domain entities stay persistence-ignorant: get-only properties are mapped explicitly (EF writes the backing field), keys are `ValueGeneratedNever` (the domain creates the `Guid`), no navigation properties. The one Domain change: `CycleCategory` and `Transaction` take a `Cycle` in their constructor, which EF cannot bind, so each gets a private constructor for materialisation.
- `decimal` is `(18,2)` by convention (`ConfigureConventions`), `DateOnly` is `date`, enums are `int`.
- String lengths: `DisplayName` 100, `ExternalId` 64, `TimeZone` 64, `Currency` 3, `Name` 60, `Icon` 40, `Colour` 20, `Note` 280. Application validation (M4) enforces the same numbers with a friendly error; the column is the backstop.
- All foreign keys are `Restrict`. SQL Server rejects multiple cascade paths anyway, and `reset-demo` deletes in order.

### Tenant isolation (section 3.3)

1. Global query filter `e => e.UserId == currentUser.Id` on `Cycle`, `Category`, `CycleCategory`, `Transaction`. `User` is unfiltered.
2. `SaveChanges`: on insert, an empty `UserId` is stamped and a foreign one throws; on update or delete, a row whose `UserId` is not the current user throws. No current user (`Guid.Empty`) means no tenant writes at all.
3. Composite foreign keys carry `UserId`, so the database refuses a child that points at another user's parent even if application code has a bug:
   - `CycleCategory (UserId, CycleId)` -> `Cycle (UserId, Id)`
   - `CycleCategory (UserId, CategoryId)` -> `Category (UserId, Id)`
   - `Transaction (UserId, CycleId, CategoryId)` -> `CycleCategory (UserId, CycleId, CategoryId)`

   The last one also enforces two domain rules in the database: a transaction's category must be in its cycle, and a `CycleCategory` with transactions cannot be removed.

### Indexes (section 8)

`Cycle (UserId, StartDate)` unique; `CycleCategory (UserId, CycleId, CategoryId)` unique (as the alternate key above); `Transaction (UserId, CycleId, CategoryId)` (the FK index); `Transaction (UserId, OccurredOn)`; `Transaction (UserId, ClientId)` unique; plus `User (ExternalId)` unique where not null, for the login lookup.

## Slices (TDD order, one commit each)

### 1. Test harness and empty migration path
- `tests/Budget.Infrastructure.Tests`: xUnit + FluentAssertions + `Testcontainers.MsSql` pinned to `mcr.microsoft.com/mssql/server:2022-latest`.
- One container per test run (collection fixture), migrated once. Tests isolate themselves by creating a fresh user each, which is the tenant model doing its job; no database resets.
- Tests: migrations apply from empty; `HasPendingModelChanges()` is false; Application references neither EF Core nor Infrastructure.
- Local tool manifest pins `dotnet-ef` 10 so migrations are reproducible.

### 2. Mapping round-trips
- Each entity saved and re-read in a new context equals what was written, including `Cycle.Status`, balances (null and set), `Transaction.UpdatedAt` after `Edit`, negative amounts, `OccurredOn` outside the cycle.
- `decimal(18,2)`: `9999999999999999.99` survives.
- Re-dating a chain of future cycles by exactly 30 days saves in one `SaveChanges` without tripping the unique `(UserId, StartDate)` index.

### 3. Tenant filter and stamping
- B cannot see A's rows through any `DbSet` or repository method.
- Insert with A's `UserId` while current user is B throws; nothing is written.
- Update and delete of A's row attached into B's context throws.
- No current user: reads return nothing, writes throw. `Users` is still readable.

### 4. Database constraints
- Duplicate `Cycle (UserId, StartDate)`, `Transaction (UserId, ClientId)`, `CycleCategory` per cycle and `User.ExternalId` are rejected; the same `ClientId` for two different users is fine.
- A `CycleCategory` pointing at another user's `Category`, and a `Transaction` in a category that is not in its cycle, are rejected by the database.
- Removing a `CycleCategory` that has transactions is rejected; without transactions it succeeds.

### 5. Repositories
- One test per interface method, against the container, covering ordering (`Cycle` by `StartDate`, `CycleCategory` by `SortOrder`, transactions newest first) and the optional category filter.

## Decisions taken (say if any is wrong)

1. **Repository methods do not take `userId`.** The query filter is the single place tenancy is decided; a second `userId` argument would be a second, bypassable source of truth. CLAUDE.md's `GetForCycleAsync(userId, cycle)` is read as a naming example.
2. **No `EndDate` column.** It is always `StartDate + 29`, a user has about twelve cycles a year, and `CycleTimeline` works on the full list. Adding a computed column later is an expand-only migration.
3. **Enums stored as `int`**, EF's default. The enum members get explicit values so reordering cannot corrupt data.
4. **`CycleCategory` lives on `ICategoryRepository`**, keeping the four interfaces the design names.
5. **Isolation between tests is by user, not by database reset.**
