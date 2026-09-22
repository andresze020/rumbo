# Period Semantics: UTC Boundaries, Snapshot Dates, `monthStartDay`

## Status

**Implemented (snapshot-date fix) and documented (scope decisions) as of
RUM-003 (2026-09-22).**

## Context

RUM-003's own ticket prompt named two decisions to make explicit rather than
silently change: whether period boundaries stay UTC, and whether
`monthStartDay` should extend past Reports. This document records both
decisions, plus the one real bug the audit found and fixed: Dashboard and
Net worth always snapshotted balances at month-end, even for the current,
still-open month.

## 1. UTC period boundaries: unchanged, by design

`src/lib/periods/month.ts` and `src/lib/periods/transaction-period.ts`
resolve every period boundary in UTC. This is deliberate, already commented
at both call sites, and **not changed by this ticket**. Switching to
household-local timezone is a product decision (what does "today" mean for
a household split across timezones? what happens at the switch moment for
existing data?) with no clear win identified during this audit — it was
explicitly flagged in the ticket prompt as something to propose, not
implement, and no case for changing it surfaced. It stays UTC.

## 2. Snapshot date: current month is "now," not "unrealized month-end"

**The bug.** `dashboard/page.tsx`, `dashboard/net-worth/page.tsx`, and
`dashboard/trend-actions.ts` each independently computed a month's balance
snapshot date as that month's calendar end — including for the current,
in-progress month. Today (e.g. Sep 21), "this month's net worth" was
computed `p_as_of_date = Sep 30`, a date that hasn't happened yet. Since the
ledger allows future-dated entries (Accounts' own unbounded query already
relies on this), a future-dated transaction could silently count toward
"this month" before its date arrived — contradicting the acceptance
criterion this ticket was scoped against: *current month shows flows from
month-start to now, snapshotted now; historical month shows the full
calendar month, snapshotted at its close.*

**The fix.** `src/lib/periods/month.ts` gained two exports:

- `monthEndDate(label)` — the calendar month-end, UTC. Pure relocation of
  logic that was independently, byte-for-byte duplicated in all three files
  above.
- `snapshotDateForMonth(label, todayIso)` — `todayIso` when `label` is the
  current UTC month, `monthEndDate(label)` otherwise.

Dashboard, Net worth (including its 6-month evolution series — the most
recent point in that series is always the current month, so it had the same
bug), and the Dashboard's net-worth trend widget
(`trend-actions.ts`) all now resolve their snapshot date through
`snapshotDateForMonth`. A past month's figures are unchanged — this only
moves the current month's snapshot from a future date to today.

Accounts was already correct: it has always used an unbounded, no-`as_of`
query for its primary view (a genuinely independent "as of right now"), so
it needed no change.

## 3. `monthStartDay`: stays Reports-only; extending it is a separate ticket

`monthStartDay` (BR-036 slice 1) is consumed only by
`/dashboard/reports` today. Every monthly RPC — dashboard, budgets, month
closures, card cycles, recurring schedules — still keys on Postgres
`date_trunc('month', ...)`, ignoring it. `docs/features/month-start-day.md`
already scopes extending this as **slice 2**, and already flags the hard
part: `budgets.budget_month` and `month_closures.closure_month` are
constrained to calendar-month values at the schema level
(`date_trunc('month', ...)` check constraints), so once a period stops
coinciding with a calendar month, what those columns *mean* is a data-model
question, not an arithmetic one — its own doc calls this out as deserving a
dedicated written decision, and it requires an additive migration.

RUM-003 does not implement slice 2: no schema change is proposed here, and
none should be made without presenting a migration/backfill plan first (per
standing repo policy). This is left as a candidate for its own follow-up
ticket, tracked in `docs/performance-ux-backlog.md`.

## 4. Transactions' periodization: untouched, confirmed separate

`src/lib/periods/transaction-period.ts` (Transactions' own date-range
resolver, from PR #66) is explicitly documented in `AGENTS.md` as *"a
separate concern, not a duplicate"* of `periods/month.ts`. RUM-003 does not
touch it — doing so would re-litigate PR #66's period unification and its
backward compatibility with existing links, which is out of this ticket's
scope.

## Verification

- `src/lib/periods/month.test.ts` covers `monthEndDate` (31/30/28/29-day
  months, December year-rollover) and `snapshotDateForMonth` (current, past,
  future month labels; first/last day of the current month).
- Manual: open Dashboard for the current month, create a future-dated
  transaction, confirm it does **not** affect the current month's figures
  (matching Accounts' existing "as of now" behavior). Open a past month and
  confirm its snapshot is unchanged (still month-end). Confirm Net worth's
  evolution chart's most recent point matches Dashboard's current-month
  figure.
