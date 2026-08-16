# Configurable month start day (BR-036) — slice 1

## Status

**Implemented — slice 1 only, shipped 2026-07-30, merged to `main` 2026-08-12.**
Migration `20260730170000_br_036_month_start_day.sql` adds
`households.month_start_day` (default 1). **Applied 2026-08-12.** No RPC was
touched. Resolver: `src/lib/periods/month.ts`. Sole consumer:
`/dashboard/reports`.

Slice 2 — budgets, month closures and the dashboard honouring the same period —
is still open; see [../pending-work.md](../pending-work.md) §1 and "Notes for
slice 2" below.

---

The BR-036 row calls this the highest-blast-radius item in the backlog and is
explicit about the shape of the first slice:

> **Scope carefully — high blast radius.** Every monthly RPC
> (`create_monthly_dashboard_functions`, budgets, month closures, reports) assumes
> calendar months. Slice 1 is a household setting plus a single shared
> period-resolver used by *one* screen; migrate the rest only once that is proven.

That is exactly what shipped, and no more.

## What is in slice 1

1. **`households.month_start_day`** (smallint, `not null default 1`, CHECK 1–31),
   editable in Settings → Household.
2. **One resolver**, `src/lib/periods/month.ts`. Nothing else computes a period.
3. **One consumer**, `/dashboard/reports`.

**Not one RPC was touched.** Reports already worked from an explicit
`date_from`/`date_to` pair, so honouring a different boundary there cost no change
to shared financial SQL at all — which is the entire reason that screen was chosen
to prove the resolver on.

## The contract

A period labelled `YYYY-MM` **starts** on `month_start_day` of that month and
**ends the day before** the next period starts. Labelling by the starting month is
what makes "the period beginning with the July paycheque" read as July.

Three of the row's verification items fall out of deriving each end from the
*next* start, rather than from the start plus a length:

| Verification | Why it holds |
|---|---|
| Month boundaries on the 1st behave exactly as today | With `month_start_day = 1`, `resolvePeriod` returns precisely what `monthStartDate`/`monthEndDate` returned. A household that never touches the setting sees byte-identical ranges. |
| A non-1st start produces contiguous, non-overlapping periods | Each period ends the day before the next begins. There is no arithmetic that could leave a gap or an overlap. |
| February and 31-day-start edge cases | The day is clamped to the month's last day. With a start day of 31: January starts Jan 31, February starts Feb 28, so the January period is Jan 31 – Feb 27 and February's is Feb 28 – Mar 30. Still contiguous, still non-overlapping — precisely because the end came from the next start. |

`periodLabelForDate` is the inverse: with a start day of 25, Jul 3 belongs to the
period that began Jun 25, labelled `2026-06`. That is what makes the "This month"
preset mean *the period containing today* rather than the calendar month today
falls in — otherwise the preset and the default view would disagree.

## The known, intended inconsistency

Budgets, month closures, the dashboard, trends, cash flow, month review and
BR-043's two budget functions all still key on `date_trunc('month', ...)`. With a
non-1st start day, their figures for the same month name **will differ from
Reports**.

This is a deliberate property of the slice, not an oversight. What matters is that
the app says so rather than letting the user discover it:

- The Settings field states which screen honours it.
- Reports renders a callout naming the start day and listing what still uses the
  calendar month — shown only when the household has actually moved off day 1.

The row's fourth verification, *"budgets/month-closures/reports agree with each
other"*, is therefore **not yet met, by design**. It is the acceptance criterion
for slice 2, and it is the reason slice 2 exists.

## Knock-on fix: BR-042's week rows

BR-042 shipped week-by-week rollup rows shown "only when the range is exactly one
calendar month". Under a custom start day that test is never true, so the rows
would have silently disappeared for exactly the households that enabled BR-036.

`buildSubPeriods` now gates on the range spanning 28–31 days instead. The weeks
are ISO weeks clipped to the range, so they partition it exactly and sum to its
totals whatever the boundaries are; the span test still excludes the multi-month
presets, which is the distinction that actually mattered.

## Notes for slice 2

- **Port the resolver, do not re-derive it.** The contract above is the thing that
  makes the properties hold; a second implementation is a second set of edge cases.
- The hard part is not the date maths, it is `budgets.budget_month` and
  `month_closures`, which key rows by month. Those need a decision about what a
  stored `budget_month` means once a period no longer coincides with a calendar
  month — that is a data-model question, not an arithmetic one, and it deserves
  its own written decision the way BR-040 got one.
- `getHousehold` reads `month_start_day` in a **separate** query that tolerates
  failure, on purpose: folding it into the main `.single()` would make every
  analysis screen bounce to `/onboarding` while the migration is unapplied,
  instead of degrading one page.
