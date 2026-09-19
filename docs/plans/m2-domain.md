# M2 plan: Domain (cycle maths + rollups)

Source: `docs/solution-design.md` section 3.2 and section 17 item 2. No UI, no DB, no EF, no Application code.
Everything lands in `src/Budget.Domain` and `tests/Budget.Domain.Tests`, test first.

## Done when

- Every rule in section 3.2 that can be expressed without a database has a failing-then-passing unit test.
- `dotnet build -warnaserror` and `dotnet test tests/Budget.Domain.Tests` are green, with no Docker needed.
- CI fails if line coverage of `Budget.Domain` drops below 90%.
- `ArchitectureTests` still passes (Domain references nothing).

## Out of scope (and where it goes)

| Thing | Milestone |
|---|---|
| `RolloverCycles` use case, repositories, `ICurrentUser`, FluentValidation, demo caps | Application, alongside M3/M4 |
| EF mappings, `decimal(18,2)` column types, unique indexes, `UserId` stamping, query filters | M3 |
| `422` / problem-details mapping of domain errors, the "past-cycle write" response flag | M4 |
| Trend reports across cycles (line graph data) | M7; it only needs `CycleRollup` totals from here |

## Types

Flat `Budget.Domain` namespace, one file per type. Folders when it passes ~15 files, not before.

| Type | Kind | Notes |
|---|---|---|
| `CategoryType` | enum | `Debit`, `Credit` |
| `CycleStatus` | enum | `Draft`, `Confirmed` |
| `CyclePhase` | enum | `Past`, `Current`, `Future` |
| `DomainException` | exception | One type, carries a stable `Code` string (`cycle.past.readonly`, ...). M4 maps it to `422`. No exception hierarchy. |
| `Money` | static helper | `Money.Validate(decimal)`: max 2 decimal places, non-zero, fits 18,2. Not a value object: amounts stay `decimal`. |
| `User` | entity | `Id`, `ExternalId?`, `DisplayName`, `IsDemo`, `TimeZone`, `Currency`, `CreatedAt`. `Today(TimeProvider)` returns the local `DateOnly`. |
| `Cycle` | entity | `StartDate`, computed `EndDate`, `Status`, `OpeningBalance?`, `ClosingBalance?`. `Confirm()`, `CreateNext()`, `Covers(date)`. |
| `CycleTimeline` | domain service over a user's cycles | `Current(today)`, `PhaseOf(cycle, today)`, `MoveCurrentStart(newStart, today)`, `RollForward(today)`, `SetClosingBalance(...)`, and the editability guards. This is where rules that need more than one cycle live. |
| `Category` | entity | `Id`, `Type` (no setter), `CreatedAt` |
| `CycleCategory` | entity | Snapshot fields + `BudgetAmount`. `CopyTo(nextCycle)`. |
| `Transaction` | entity | `CycleId` fixed at creation, `Amount`, `OccurredOn`, `Note`, `ClientId`, timestamps passed in (no clock inside entities). |
| `CycleRollup` | pure function + result records | `CycleRollup.Calculate(cycle, cycleCategories, categories, transactions)` |

All entities carry `UserId` as a plain property; enforcement is M3's job.
Dates are `DateOnly`. The only clock is `TimeProvider`, passed into `User.Today`; everything else takes `today` as a parameter, which keeps tests free of fakes.

## Slices (TDD order, one commit each)

### 1. Cycle basics
- `EndDate` is `StartDate + 29`; there is no way to set it.
- New cycle is `Draft`; `Confirm()` makes it `Confirmed`; confirming twice is a no-op.
- `CreateNext()` starts on `StartDate + 30`, is `Confirmed`, and throws on a `Draft` cycle.
- `Covers(date)` is inclusive at both ends.

### 2. "Today" and phases
- `User.Today`: 13:30 UTC is already tomorrow in `Australia/Sydney`; one case either side of a DST change; unknown time zone id throws.
- `CycleTimeline.Current(today)` is the earliest cycle with `EndDate >= today`; with a gap, the next cycle is current even though it has not started; returns null when every cycle has ended.
- `PhaseOf`: before current is `Past`, after is `Future`.

### 3. Money and transactions
- `Money.Validate`: rejects zero, more than 2 decimal places, and overflow of 18,2; accepts negatives (reversals).
- `Transaction` needs a `Confirmed` cycle; `Draft` throws.
- `CycleId` has no setter; editing `OccurredOn` to a date outside the cycle is allowed and does not move it.
- Transactions are allowed in past and current cycles, not future ones.

### 4. Categories and the snapshot
- `Category.Type` is immutable.
- Editing a `CycleCategory` changes only that row.
- `CopyTo` copies name, icon, colour, order and budget, keeps `CategoryId`, takes the new `CycleId`.
- Remove guard: throws when the category has transactions in that cycle (caller passes the fact in; the count is a repository concern).
- `BudgetAmount` goes through `Money.Validate`, except that zero is allowed and negatives are not.

### 5. Editability matrix
One parameterised test per cell of the table in section 3.2:
- Past: categories, budgets, start date and opening balance throw; closing balance and transactions pass.
- Current: everything passes.
- Future: categories and budgets pass; start date, opening and closing balance throw.
- A past-cycle transaction write reports `RequiresClosingBalanceReview = true` so M4 can flag the response.

### 6. Moving the start date
- Only the current cycle; past and future throw.
- New start must be after the previous cycle's `EndDate`; equal to it throws (overlap), a gap passes.
- With no previous cycle, any date passes.
- Every future cycle is re-dated to keep the 30-day chain; past cycles are untouched.
- Transactions are not touched (asserted by the absence of any transaction parameter, plus one test).
- Works on a `Draft` first cycle (onboarding).

### 7. Rollover
- Nothing due: returns no new cycles (idempotent).
- One cycle overdue: creates one. 95 days overdue: creates as many as needed until one covers today.
- Only-cycle-is-`Draft` user is skipped.
- If future cycles already exist and cover today, nothing is created.
- Each new cycle gets a copy of the previous cycle's `CycleCategory` rows, including categories added mid-cycle.
- New cycle's `OpeningBalance` equals the previous `ClosingBalance`, or null when that is not entered yet.
- Setting a closing balance later pushes it into the next cycle's opening balance (see decision 2).

### 8. Rollup
- Per category: `budgeted`, `actual` (sum, reversals subtract), `remaining = budgeted - actual`, `percentUsed`.
- Status: Debit `Over` when `actual > budgeted`; Credit `Ahead` when `actual > budgeted`; equal is neither.
- `percentUsed` is null when `budgeted` is zero.
- Totals: budgeted and actual for debits and for credits; `net = credits - debits`; `accrued = closing - opening` only when both are entered, otherwise null.
- A category with no transactions still appears, with zero actual.
- A transaction whose category has no `CycleCategory` in the cycle throws (invariant breach, not a user error).
- Output order follows `SortOrder`.

## CI and tooling

1. Coverage gate: swap `coverlet.collector` for `coverlet.msbuild` in `Budget.Domain.Tests` and run
   `dotnet test tests/Budget.Domain.Tests /p:CollectCoverage=true /p:Include="[Budget.Domain]*" /p:Threshold=90 /p:ThresholdType=line`.
   The collector cannot enforce a threshold on its own; this avoids adding a report tool. The Application gate is added the same way when that test project exists.
2. Merge or close the five open Dependabot PRs before starting: three of them touch `Budget.Domain.Tests.csproj`, and the `coverlet.collector` one becomes moot after step 1.
3. Update the CLAUDE.md commands block with the coverage command.

## Decisions needed

Each has a recommendation, and work can start on slices 1 to 4 without any of them.

1. **Assertion library.** CLAUDE.md says FluentAssertions, but version 8 and later needs a paid licence for commercial use, and Dependabot will propose it. Options: pin FluentAssertions 7.x and ignore the major in `dependabot.yml`; use the AwesomeAssertions fork (same API, Apache 2.0); or stay on xUnit `Assert`, which M1 already uses. **Recommend AwesomeAssertions**: no licence question in a public portfolio repo and no pinning to maintain.
2. **Opening balance "follows" the previous closing balance.** Store and push, or derive on read? **Recommend store and push**: `SetClosingBalance` on cycle N writes cycle N+1's `OpeningBalance`. It is a system write, so the past-cycle read-only rule does not block it. Consequence to accept: correcting a past closing balance overwrites an opening balance the user typed into the current cycle.
3. **Can moving the start date turn the current cycle into a past one?** Moving the start far enough back puts `EndDate` before today. **Recommend rejecting it** (`EndDate` must stay `>= today`); otherwise one edit silently triggers a rollover.
4. **Zero amounts.** **Recommend**: a zero transaction is rejected, a zero budget is allowed (a category you track but do not plan for).
5. **`percentUsed` precision.** **Recommend** returning the unrounded ratio times 100 and letting the UI format it; rounding in the domain would only need undoing later.
6. **Gaps and rollover.** After a start-date move leaves a gap, rollover still chains from the latest cycle (`StartDate + 30`), so the gap is permanent history and never back-filled. **Recommend accepting that**; it matches user story Settings 4.
