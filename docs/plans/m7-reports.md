# M7 plan: Charts and reports (trend line on the Cycles page, `GET /api/reports/cycles`)

Source: `docs/solution-design.md` section 4 (`GET /api/reports/cycles`), section 7 ("Charts") and section 17 item 7; `docs/user-stories.md` Reporting 1 to 3; `design-system/budget/MASTER.md` section 10 (Charts), section 9 ("Cycle list row", "Segmented control") and 3.4 (line styles). Picks up what M2, M3, M4 and M6 deferred here: the report endpoint and its repository methods, the trend chart with its filter and "View as table", and "spent against budgeted" on the cycle list row.
Code lands in every layer but it is small: one Domain overload, one Application use case, one grouped query, one route, one web feature folder. One new dependency: Recharts.

## Status: implemented

All eight slices are in, with decisions 1 to 7 taken as recommended. Web: 319 tests (Vitest), `oxlint` clean, `tsc -b` and `vite build` green. .NET: 336 tests (Domain 124, Application 89, Infrastructure 39, API 84), `dotnet build -warnaserror` clean. Recharts is a 321 kB chunk of its own; the entry chunk grew by 6 kB.

Checked against a real stack, not only mocks: this branch's production image on port 8097 with its own SQL container, `migrate` seeding the demo, and headless Edge driven over the DevTools protocol at 390px (360 for overflow). Seventeen checks, all passing, against the **built SPA served by the API**:

- `GET /api/reports/cycles` answered five cycles: four Past with accrued (one of them −$219.25) and the Current one partial.
- The chart drew a line across all five with the summary "Spending fell 5% over the last 4 finished cycles, and is at $2,996.80 so far.", and each point is a 44px target named with its own amount ("13 May: $3,506.85").
- Tapping a point showed "13 May to 11 Jun $3,506.85".
- Accrued drew its zero baseline with the first cycle below it, and stopped at the cycle with no closing balance instead of dropping to zero.
- The category chips scrolled without the page scrolling; Rent drew in slate with its dash-dot style.
- Switching theme redrew the line from `#cbd5e1` to `#475569`, so the tokens are being re-read.
- "View as table" gave five rows with the current cycle marked "so far".
- No sideways scroll at 390 or 360, and no tap target under 44px.

Not checked, and why: a real phone, a screen reader, and 200% text. Playwright specs for story Reporting 3 are M8's.

Where the code differs from the plan below:

- **The y axis fits the data instead of starting at zero** (`includeZero` only for accrued). Found by screenshot, not by test: with the axis anchored at zero, four cycles of household spending sat in the top fifth of the chart and a 5% fall read as a flat line, which is the one thing a trend chart must not do. MASTER 10 asks for a zero baseline for accrued specifically, and that is where it is kept; zero still appears whenever a series crosses it.
- **A flat series gets a band around itself.** Also found by screenshot: Rent is $2,200 every cycle, so min equalled max, and the first version returned a single `[0]` tick, pinning the line to the top of an axis labelled "$0". It now pads by a tenth and the line sits in the middle.
- **The current cycle's point is drawn hollow.** The part-spent total dives at the right-hand end and read as a crash at a glance. It is never colour alone: the tooltip and the table both say "so far", and the summary sentence ignores the cycle entirely.
- **The summary sentence accounts for the cycle it does not count.** Raised on review: the demo's Transport is 100, 115, 100, 125 across its finished cycles and $62.40 three days into the current one, so "Transport rose 25% over the last 4 cycles" sat above a line that visibly plunged and read as a bug. The comparison is still finished cycles only (the reason for that has not changed), but the sentence now says the cycles it counted were *finished* and adds ", and is at $62.40 so far", so every point on the chart is spoken for. MASTER 10's example wording ("Spending fell 8% over the last 6 cycles") is an illustration rather than a rule, and this keeps it one sentence; worth confirming against MASTER if that example is meant literally.
- **Each point's accessible name carries its amount** ("13 May: $3,506.85"), not just its date, so the value can be read without waiting for the tooltip's live region.
- **`vitest` is capped at four workers.** One jsdom per core, with Recharts loaded into one of them, ran the heap out of memory on a sixteen-core machine and took five whole test files down with it (they were reported as "passed" because they never ran).
- **The storage helpers live in `chartFilter.ts`**, not beside the control, because `oxlint`'s fast-refresh rule fails a component file that also exports functions.
- **Components are `TrendChart.tsx`, `TrendSection.tsx`, `TrendFilter.tsx`, never `Trend.tsx`**, which on a case-insensitive disk would resolve to `trend.ts` (the CLAUDE.md rule from M6).
- **`CycleDto.From` replaced the private mapper in `Cycles`**, so the report and the single-cycle endpoint map a cycle the one way. An API test asserts the two return byte-identical JSON for the same cycle.
- **`Accrued` takes the server's number** instead of subtracting the two balances in the page, which removes the M6 compromise noted in that plan.
- **The N+1 guard is an Infrastructure test with a command-counting interceptor**, not an API test: it runs `Reports` against real SQL for two cycles and for six and asserts the count is equal *and* within 1 to 8, so a counter that counts nothing cannot pass it at zero.
- **Red-first, honestly:** every test file was written and run before its code. Real failing assertions (not just a missing import) were seen for `niceTicks` (the top tick fell below the maximum, because the loop stopped before covering the range), and the seed change made three tests fail that had pinned the demo to three cycles; those now derive the count from the fixture. The Infrastructure report tests first failed on a foreign key, which was the schema correctly refusing a transaction whose category was not in its cycle: the test data was wrong, not the code.
- **The demo seed grew to 130 days** (decision 7), and `ResetDemoTests`/`ResetDemoJobTests` no longer hardcode the cycle count.

## Context

Reporting 1 and 2 (the list of cycles, a cycle against its budgets) shipped in M6. Reporting 3, the line graph across cycles, has nothing: no endpoint, no chart library, and the cycle list row is missing the "spent against budgeted" that MASTER 9 asks for because `GET /api/cycles` carries no totals.

Outcome: the Cycles page shows a trend chart with the list of cycles. The visitor switches it between Total spending, one category and Money accrued, taps a point for the exact figure, can read the same data as a table, and each list row says what was spent against what was budgeted. With the network off, the last report renders and the current cycle's numbers include what is waiting in the outbox.

## Done when

- `GET /api/reports/cycles` answers for the signed-in user only (tenant isolation test), oldest first, in a fixed number of queries however many cycles there are.
- The Cycles page has the chart per MASTER 10: 220px, x axis "1 Sep", at most four compact-currency y ticks, horizontal grid only, 4px dots with 44px hit areas, tap tooltip with the cycle dates and exact amount, zero baseline when accrued is shown, colours read from CSS variables so a theme switch redraws.
- Filter: Total spending / Category / Accrued (segmented control); choosing Category shows a horizontally scrolling chip row of categories, and the page still never scrolls sideways at 360 and 390.
- A one-sentence summary above the chart, a "View as table" toggle with the same data, `role="img"` and an `aria-label` on the SVG.
- Fewer than three points: stat cards instead of a line.
- Cycle list rows show spent against budgeted.
- Offline: the cached report renders; a queued transaction in the current cycle moves the last point and its list row.
- Recharts is in its own lazy chunk: the entry chunk does not grow by more than a few kB (checked in `vite build` output).
- `npm run lint`, `npm run test`, `npm run build`, `dotnet build -warnaserror`, `dotnet test` green; Domain and Application coverage at or above 90%.
- MASTER section 14 run on the Cycles page in both themes, including the chart line this time.

## Out of scope (and where it goes)

| Thing | Milestone |
|---|---|
| Several categories on the chart at once (MASTER 10 allows up to four with line styles) | Not planned. The stories ask for "a single category". The line-style tokens are applied to the one line now, so adding more later is a loop, not a redesign |
| Date-range picker, paging the report | Not planned. About twelve cycles a year; `ponytail:` note on the endpoint, add `?last=N` when someone has five years of data |
| CSV export | M10, with export and delete account |
| Charts on Home or cycle detail | Never (MASTER 10: progress rows are the visualisation) |
| Service worker caching of `/api/reports/*` | M8, with the other runtime caches. The Dexie cache already covers a dropped network with the tab open |
| Playwright spec for Reporting 3 | M8 |

## The one design that matters: the report is a list of what the app already has

`GET /api/reports/cycles` returns `CycleSummaryDto[]`: the same record `GET /api/cycles/{id}` returns, once per cycle. Design section 4 asks for "per cycle: total spend, spend per category, opening, closing, accrued", and `CycleSummaryDto` is exactly that (`Rollup.DebitsActual`, `Rollup.Categories[].Actual`, `Cycle.OpeningBalance`, `Cycle.ClosingBalance`, `Rollup.Accrued`) plus the budgets, names, colours and phase that the list row and the chart need anyway.

What that buys:

- No new DTO, no new web type (`CycleSummary` exists), no second definition of "total spend".
- `overlaySummary` already lays the outbox over a `CycleSummary`, so the report gets offline numbers by mapping it over the array. No new rollup maths in the front end (CLAUDE.md: `overlay.ts` is the only place).
- One query feeds the chart and the list, so they cannot disagree.

What it must not do is load every transaction the user ever made to add them up. So the sums are done in SQL and the Domain takes totals:

- **Domain:** `CycleRollup.Calculate(cycle, cycleCategories, categories, IReadOnlyDictionary<Guid, decimal> actualsByCategory)`. The existing overload (which takes transactions) groups and delegates to it, so there is still one `Line`.
- **Application:** `ITransactionRepository.SumByCycleAndCategoryAsync()` returning `(CycleId, CategoryId, Total)` rows, and `ICategoryRepository.ListForAllCyclesAsync()` for the snapshots. A new `Reports` use case in `Reports/` does: timeline, snapshots, identities, sums (four queries), then one `Calculate` per cycle.
- **Infrastructure:** the sum is one `GROUP BY` over the existing `Transaction (UserId, CycleId, CategoryId)` index; the tenant filter applies as usual. No migration.

Size: twelve cycles a year by about fifteen categories is a few kB a year. Unbounded is fine for a long time; marked `ponytail:`.

## What the chart draws

- **Points are Confirmed cycles whose phase is Past or Current.** Upcoming cycles have no spending and would drag the line to zero; a Draft is not a cycle yet. The list still shows every cycle.
- **The current cycle is the last point and is labelled "so far"** in the tooltip and the table. Leaving it off would hide the number a person most wants; drawing it unlabelled would read as a crash in spending on day 3.
- **The summary sentence compares completed cycles only** ("Spending fell 8% over the last 6 cycles"), so the partial current cycle never produces a false "fell 70%". With fewer than two completed cycles it says what there is ("2 cycles so far").
- **A missing value is a gap, not a zero.** Accrued is null until a closing balance is entered; a category that was not in a cycle has no value there. The line breaks (`connectNulls` off) and the table shows a dash.
- **"Fewer than three" counts points with a value for the chosen filter**, so Accrued with two closing balances entered gives stat cards even when Total spending has a line.
- **The category chips come from the report itself**: every category id seen, named and coloured by its newest snapshot, Spending before Income. `GET /api/categories` stays as it is but the web does not call it, because it has no colour and the line needs the slot. Category line: `--cat-<slot>` and the slot's dash pattern from MASTER 3.4; Total and Accrued: `--color-primary`, solid.
- **Filter choice is kept in `localStorage`** (`budget.chartFilter`), like the theme and last-used category. A remembered category that no longer exists falls back to Total spending.

## Slices (TDD order, one commit each)

First commit is this plan. Slices 4 to 7 end with MASTER section 14.

### 1. Domain: rollup from totals
- Tests first: `Calculate` with a totals dictionary gives the same `CycleRollup` as the transactions overload for the same data (debit over, credit ahead, zero budget, empty cycle); a total for a category the cycle does not contain still throws.
- Code: the new overload; the old one groups and delegates.

### 2. Application: `Reports` use case
- `Reports/Reports.cs`, the two repository methods on the interfaces, in-memory fakes extended.
- Tests first: oldest first; each element equals what `Cycles.GetAsync` gives for that cycle (the property that keeps the two endpoints honest); a Draft-only user gets one element with zero actuals; no cycles gives an empty list; accrued null without a closing balance.
- Does **not** call `RolloverCycles`: `GET /api/cycles/current` is the fallback trigger and nothing else may be (CLAUDE.md).

### 3. Infrastructure and API
- Repository impls; Testcontainers tests first: sums grouped correctly across two cycles and three categories, reversals (negative amounts) subtract, user B's rows never counted.
- `ReportEndpoints.cs`: `GET /api/reports/cycles` in the `/api` group (authenticated, global rate limit, a GET so no antiforgery). API tests first: `401` anonymous; shape; tenant isolation (user A's report has none of user B's cycles); query count does not grow with cycles (assert with a command-counting interceptor if one exists in the test host, otherwise two cycles against six and compare).
- Design section 4's row for the route gets the precise shape.

### 4. Web: report query and the list row
- `useCycleReport()`: `useCachedQuery(['cycles', 'report'], ...)` with `overlaySummary` mapped over it. The key sits under `'cycles'` so whatever invalidates the cycle queries after a drain refreshes it too (checked against `OutboxSync` when writing the test).
- `Cycles.tsx` reads this hook instead of `GET /api/cycles`; the row gains "$1,240.00 of $1,500.00 spent" (tabular, shared formatter) and takes `accrued` from the rollup instead of working it out. The comment about M7 goes.
- Tests first (MSW): rows show spent against budgeted; a queued create in the current cycle raises that row's spent; cached report renders before the network answers; error and empty states unchanged.

### 5. Series maths (pure, no React)
- `features/cycles/trend.ts`: `toSeries(report, filter)` giving `{ cycleId, label, start, end, value | null, partial }[]`, `categoriesOf(report)`, `summarise(series, filter, currency)` for the sentence, `niceTicks(min, max)` capped at four.
- Tests are the spec, table-driven: phase and Draft filtering; gaps; the partial flag; summary wording for fell, rose, flat, negative accrued (true minus, + sign), one or no completed cycles; ticks include zero when the range crosses it.

### 6. Chart
- `npm i recharts` (current major supports React 19). `TrendChart.tsx` is loaded with `React.lazy` behind a 220px `Skeleton`, so Recharts never reaches the entry chunk.
- `LineChart` with `isAnimationActive` off under `prefers-reduced-motion`, custom dot (4px visible, 44px transparent hit circle, real `<button>`-like semantics via `tabIndex` and `aria-label` so the keyboard reaches each point), tooltip on tap that stays until another tap, `ReferenceLine y={0}` for Accrued, colours resolved from `getComputedStyle` and re-read when `data-theme` changes (a `MutationObserver` on `<html>`, a few lines, in `theme/`).
- Stat cards (existing `Card`) under three points.
- Tests: jsdom cannot lay out SVG, so tests assert what is ours, not Recharts' pixels: the `role="img"` label, stat cards under three points, the table has one row per point with signed accrued and "so far" on the current cycle. The drawn chart is checked in the browser (verification below).

### 7. Filter, summary, table toggle, on the page
- Segmented control (three segments), chip row for categories in its own `overflow-x: auto` container with `minmax(0, 1fr)` on the parent track, summary sentence, "View as table" as a `<button aria-pressed>` swapping the chart for a real `<table>` with a caption.
- Placement: decision 3.
- Tests: switching filter changes the table's figures; the chip row appears only under Category; the stored filter is restored; a stale stored category falls back.

### 8. Docs and verification
- Plan status and deltas; CLAUDE.md (the report is `CycleSummary[]`, chart rules worth keeping); design doc section 4 and 7 deltas; the demo seed gets more history. Today it is `firstCycleStartOffset: -70` with two closing balances: three points for spending, but only two for accrued, so the demo would show stat cards under Accrued and never the line with its zero baseline. Move the offset to about -130 (four past cycles plus the current one) with four closing balances, one of them below its opening so accrued goes negative. This changes what `migrate` seeds and `reset-demo` restores; any test that counts seeded cycles moves with it. Decision 7.

## Decisions taken (all as recommended, 2026-09-20)

1. **The report is `CycleSummaryDto[]`**, not a purpose-built slim DTO. Recommended, for the reasons above. Cost: the payload carries fields the chart ignores (icon, remaining, percent), a few hundred bytes per cycle.
2. **Recharts, as MASTER 10 and design section 7 say, lazy-loaded.** The alternative is about a hundred lines of hand-written SVG for one line, dots, four ticks and a baseline, with no dependency and nothing to lazy-load. Recommended: Recharts. It is the written decision, it is what a reviewer of a portfolio piece expects to see used well, and the custom-dot and theme work is needed either way. If the lazy chunk turns out to be large for what it draws, that is a MASTER question to raise, not to settle inside a slice.
3. **The chart sits above the list** (M6 plan slice 10: "M7 adds the chart above the list"; design section 7 words it the other way round, "lists all cycles above a line graph"; the story says "alongside"). Recommended: chart first. The list grows for ever and would push the chart off the screen within a year. The design doc gets the one-word fix.
4. **The current cycle is on the chart, marked "so far", and left out of the summary sentence.**
5. **Category chips come from the report, not `GET /api/categories`.** The endpoint exists for this but has no colour. Alternative: add `Colour` to `CategoryIdentityDto` and make a second request. Recommended: derive, one request.
6. **The Cycles page moves wholly onto the report query** and stops calling `GET /api/cycles` (other screens that use it keep doing so). One request, and list and chart cannot disagree.
7. **The demo seed grows to four past cycles, one with negative accrued**, so a visitor sees a real line under every filter. Cost: the seed's transaction count rises towards the demo caps; check the cap leaves a visitor room to add.

## Verification

- `dotnet build -warnaserror`; `dotnet test`; in `src/web`: `npm run lint && npm run test && npm run build`, and the build output shows Recharts in its own chunk.
- Throwaway stack plus headless Edge at 390px (360 and 700 for overflow), light and dark, against the built SPA: demo sign-in, Cycles page, each filter, a category with a dashed slot, tap a point, theme switch redraws the line, "View as table", network off then add a transaction and watch the last point move, `scrollWidth === clientWidth`, no target under 44px.
- MASTER section 14 on the Cycles page.
