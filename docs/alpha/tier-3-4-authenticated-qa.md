# Tier-3 / Tier-4 Authenticated QA

> Documentation only. Authenticated real-data QA record for the Tier-3 and
> Tier-4 features merged to `main` on 2026-08-12. Their migrations are applied,
> so every row below is **live against real data with no QA pass behind it** —
> this doc exists to close that gap, and it is the open item tracked as §4.4 of
> [../pending-work.md](../pending-work.md). Follows the shape of
> [pr-37-authenticated-qa.md](./pr-37-authenticated-qa.md). No real amounts,
> account numbers, balances, or transaction details are recorded here.

## Field guide

| Field | Meaning |
|---|---|
| ID | Backlog identifier the feature shipped under. |
| Area | Flow under test. |
| Result | Passed, Partial, Failed, or Untested. |
| Exact check | The observable assertion that closes the row. Written as an invariant, not a click path, so it stays true as the UI moves. |
| Evidence | Structural behavior observed in the authenticated app. Fill in when the check is run. |

---

## How to run this pass

- **Run `npm run db:test` first.** It takes seconds, it is read-only, and it
  closes the ledger-shaped rows against your real data before you spend a
  session clicking. Anything it reports as `passed = false` is a real finding —
  stop and look at it rather than continuing the manual pass around it. See the
  desk audit below for which rows it covers.
- Use a real authenticated session against real household data. A logged-out
  render or a seeded fixture does not close a row.
- Every check below is **non-destructive or self-reverting**. Where a row needs
  a write, create it, assert, then void/archive it — do not physically delete
  (see the ledger rules in `.claude/CLAUDE.md`).
- The recurring invariant behind most rows: **balances come from
  `transaction_entries`, reports and budgets come from
  `transaction_allocations`.** A feature that changes one and not the other
  where it should have is the bug class this pass is looking for.
- Record the date of the pass as a new `## Results — YYYY-MM-DD` section rather
  than editing an earlier one.

---

## Results — pending

| ID | Area | Result | Exact check | Evidence |
|---|---|---|---|---|
| BR-035 | Installments | Untested | **Row corrected 2026-09-04 — the previous wording was wrong.** It claimed balances stay unchanged "until an individual instalment is actually posted"; `create_installment_plan` in fact inserts **all N instalments as `posted`** in the same call, each with its own entry and allocation. What BR-035 actually guarantees is that the plan is a *label*: no parent transaction carries the total on top of the instalments, so the money exists exactly once, spread over N rows. Check: create a plan, confirm the account balance and category breakdown move by the **full total** immediately (spread across the N dated rows, so a single month's budget sees only that month's instalment), and that no single transaction holds the total. Mostly automated — see `supabase/tests/br_035_installment_invariants.sql`. | |
| BR-040 | Refunds | Untested | A refund reduces the original expense rather than registering as income. After recording one, the category breakdown for the period must fall by the refund amount, and the income KPI must not move. **Already automated** — `supabase/tests/br_040_refund_invariants.sql` asserts the refund's allocation is a negative *expense* (which is the "not income" half), its entry is positive, and no refund exceeds the expense it refunds. What is left for a human is the on-screen KPI reading. | |
| BR-030 | Card statement cycle | Untested | With `statement_day` / `payment_day` / `billing_account_id` set on a credit card, `get_card_cycle_summaries` must return payable, outstanding, statement balance, paid-since-close and overdue state consistent with the card's own transaction list for the same window. Cross-check one closed cycle by hand. | |
| BR-045 | Time of day | Untested | Time is optional. A transaction saved without a time behaves exactly as before (same period bucket, same ordering tie-break); one saved with a time lands in the same day everywhere — transactions list, Reports, Calendar — regardless of timezone rendering. | |
| UC-9 | Recurring transfers | Untested | A same-currency recurring transfer auto-posts as **one** transaction with at least two entries and does **not** appear as income or expense in Reports. A cross-currency template must be refused auto-posting in all three places (form toggle disabled, server action refuses, job flags and skips) — this is the accepted limitation, so the check is that the refusal holds, not that it posts. **Mostly automated** — `supabase/tests/uc_009_recurring_transfer_invariants.sql` proves the refusal held against real data (no cross-currency template ever auto-posted, none is left with `auto_post` on) and that what the job wrote balances to zero with no allocation. The refusal is app-layer, not a DB constraint, so only the data can prove it. Left for a human: the form toggle actually being disabled on screen. | |
| BR-044 | Notes | **Structural** | The "no financial side effect" half is true **by construction** and needs no pass: `public.notes` has no amount column and no foreign key into `transactions`, `transaction_entries` or `transaction_allocations`, so a note cannot move money whatever the UI does. The half that does need a pass is RLS isolation, and it needs a **second household's session** — a single logged-in user cannot demonstrate that another household's notes are invisible. Run it when there is a second member, or fold it into a general RLS pass rather than a BR-044 one. | Schema verified 2026-09-04. |
| BR-037 | Calendar | Untested | Calendar and Reports read the same rows (`src/lib/analysis/`). Pick one month and confirm the calendar's per-day totals sum to the Reports total for the same period and filters. | |
| BR-039 | Transfer-as-expense | Untested | The row reaches KPIs, trend, week rows and the calendar but **never** the category breakdown, and never touches balances, net worth or budgets. Confirm both halves: it appears where it should, and the breakdown/balances are untouched. The on-screen note saying so must be present in Reports and Calendar. **The hard half is already automated** — `br_003_006_money_invariants.sql` check "BR-006 transfers have no reporting allocations" *is* the "never reaches the category breakdown" guarantee, and eligibility (savings/investment/other only) is a DB CHECK. `treat_transfers_as_expense` is a reporting-only flag read by `report-query.ts`; the migration touches no ledger table. Left for a human: that the row appears where it should, and the on-screen note. | |
| BR-043 | Budget comparison + payment split | Untested | The comparison figures reconcile against `transaction_allocations` for the same period, and the payment split does not double-count a payment across the split legs. | |
| BR-036 | Custom month start day | Untested | With a non-default `month_start_day`, Reports uses the custom period (`src/lib/periods/month.ts`) while budgets, month closures and the dashboard still use the calendar month. The figures for the same month name are therefore expected to **differ** — the check is that the difference is exactly the boundary days, and that the on-screen statement of the inconsistency is shown. Slice 2 is what removes it. | |
| BR-031 | Multi-currency entry | Untested | The **create** transaction form shows the base-currency preview and the paired transfer-amounts card. The **edit** forms do not — that is BR-031 slice 2, not a bug. Confirm a foreign-currency transaction created through the form stores the rate it was booked at, and that editing it does not silently drop that rate. | |

---

## Desk audit — 2026-09-04

Every row was read against the code before the pass was run, on the theory that
a checklist you cannot trust wastes the session it is used in. Three results:

**One row was wrong.** BR-035 claimed balances stay unchanged until an
instalment is posted. `create_installment_plan` posts all N at creation. Anyone
running that row would have seen the balance move and either filed a false bug
or, worse, recorded a pass against a misunderstanding of what BR-035 protects.
Row rewritten; the real guarantee is that no parent transaction carries the
total on top of the instalments.

**Four rows are wholly or mostly closed by invariants that run against real
data**, three of which already existed and had never been cross-linked:

| Row | Invariant file | Covers |
|---|---|---|
| BR-040 | `br_040_refund_invariants.sql` *(existed)* | The whole ledger claim: refunds are negative expense allocations, never income |
| BR-039 | `br_003_006_money_invariants.sql` *(existed)* | "Transfers have no reporting allocations" — the category-breakdown guarantee |
| BR-035 | `br_035_installment_invariants.sql` *(new)* | Instalments sum to the plan total, numbering is 1..N, no parent row |
| UC-9 | `uc_009_recurring_transfer_invariants.sql` *(new)* | No cross-currency template ever auto-posted; auto-posted transfers net to zero |

`npm run db:test` discovers those automatically. They run read-only against the
linked database, so they check **real household data**, and they keep checking
it — which is the difference between a row someone glanced at once and an
invariant that cannot silently rot.

**BR-044 needs no pass for the half people worried about.** `public.notes` has
no amount column and no foreign key into the ledger, so "no financial side
effect" is structural. Its RLS half needs a second household session.

## Desk audit — 2026-09-30 (BR-030 and BR-043)

Read `get_card_cycle_summaries` (`20260730140000_br_030_card_statement_cycle.sql`)
and `get_budget_previous_actuals` / `get_budget_payment_split`
(`20260729140000_br_043_budget_comparison_split.sql`) against
`get_monthly_budget_details` (`20260602000300_budget_module.sql`, never redefined
since). Both findings below were then **reproduced on 2026-09-30** in a
throwaway household (demo user, one checking account, one card with
`statement_day` 15 / `payment_day` 5, one budgeted category) built inside a single
transaction against the live project and rolled back — afterwards 0 rows of any
kind remained. Real data today: 24 budgets, 58 lines, **no refund anywhere**
(0 negative expense allocations) and 1 card with a cycle, so neither finding
shows up in the household yet.

**BR-043: the copied predicate is in sync.** It matches the original clause for
clause, and `budget_lines_unique_active_category` rules out double counting from
two lines on one category. The three buckets always sum to Total spent.

**BR-043: confirmed bug — a refund lands in "Other accounts".** The split
attributes each transaction to its most negative entry (`attributed` CTE). A
refund (BR-040) is a negative expense allocation whose only entry is positive, so
it has no paying entry and falls into `other`. Reproduced: 100 from checking, 50
and 80 on the card, then a 30 refund of the 80. The budget line correctly reads
200 spent, but the split went from cash 100 / card 130 / other 0 to cash 100 /
card 130 / **other −30**. Cash and Cards stay gross of the refund and the page
renders an "Other accounts" card with a negative amount and share
(`budgets/page.tsx` shows it whenever `other !== 0`). The three buckets still sum
to Total spent, which is why the sum check cannot catch it. **Fixed on branch
`fix/br-043-refund-payment-split`** (migration
`20260930120000_br_043_refund_payment_split.sql`, merged as #84 and applied 2026-09-30): a refund is
attributed to the account it credited.

**BR-030: confirmed edge — a refund of a post-close charge shrinks the closed
statement.** `paid_since_close` counts every positive entry after the close.
Reproduced on the same card (close 09-15, as of 09-25): a 50 charge before the
close and an 80 charge after it read `payable` 50 / `outstanding` 80; after a 30
refund of the 80, they read `payable` **20** / `outstanding` **80**, where 50 / 50
is right. Total owed is the same, but the statement due on the payment date can
show 30 less than an issuer that does not apply post-close credits to a billed
statement will ask for. Refunds of charges inside the closed window, and
payments, are correct. **Fixed on branch `fix/br-030-refund-card-cycle`**
(migration `20260930130000_br_030_refund_card_cycle.sql`, merged as #85 and applied 2026-09-30): a
post-close refund offsets the open cycle first, and only its excess reaches the
statement.

### Hand check — BR-030 (one closed cycle, in the card's currency)

1. Pick a card with `statement_day` / `payment_day` set; note both.
2. Transactions filtered to that account, dated up to and including the close
   date: the net of posted entries, sign flipped, is `statement_balance`. Opening
   balance counts; pending and voided do not.
3. Posted entries after the close, up to today: positives sum to
   `paid_since_close`, negatives (absolute value) to `outstanding`.
4. `payable` = `statement_balance` − `paid_since_close`, floored at 0. Overdue
   only if `payable` > 0 and the due date is already past.
5. If a card uses day 29–31, confirm February's close date clamps to the 28th/29th.

### Hand check — BR-043

1. Budgets, a month with spend: "Cash and accounts" + "Cards and debt" + "Other
   accounts" must equal Total spent.
2. "Last month" must equal last calendar month's actuals on the same categories
   (calendar month even under a custom `month_start_day`).
3. Refund case: pick a month with a refund in a budgeted category. A negative
   "Other accounts" card confirms the bug above.

## QA Summary

- Passed: none yet — the authenticated pass has not been run.
- Automated: BR-040 and BR-039 (pre-existing), BR-035 and UC-9 (added
  2026-09-04). Run `npm run db:test` to execute them.
- Structural, no pass required: BR-044's financial-side-effect half.
- Failed: none observed.
- Doubts: BR-030 and BR-043 are still the two rows most likely to need a hand
  reconciliation rather than a glance, because both aggregate across a window.
  Neither is cheap to express in SQL without reimplementing the report query,
  which would test the copy rather than the original.
- Bugs found: one documentation bug (the BR-035 row above). No code bug.
- Recommended order for the human pass, now that the ledger-shaped rows are
  automated: **BR-030 and BR-043 first** — they aggregate, so a silent error
  there is both the most likely and the least visible. Then BR-037 (calendar
  vs Reports totals), BR-036 (boundary days), BR-045 (time of day) and BR-031
  (form FX), which are all read-and-compare. Finish with the on-screen halves
  of BR-039, BR-040 and UC-9 that the invariants cannot see.
