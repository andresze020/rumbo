# Tier-3 / Tier-4 Authenticated QA

> Documentation only. Authenticated real-data QA record for the Tier-3 and
> Tier-4 features merged to `main` on 2026-08-12. Their migrations are applied,
> so every row below is **live against real data with no QA pass behind it** —
> this doc exists to close that gap, and it is the open item tracked as §4.3 of
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
| BR-035 | Installments | Untested | An installment plan holds no money and has no parent transaction. Create a plan, then confirm account balances, net worth, the category breakdown and any budget covering the period are all unchanged until an individual instalment is actually posted. Posting one instalment moves the balance by that instalment only. | |
| BR-040 | Refunds | Untested | A refund reduces the original expense rather than registering as income. After recording one, the category breakdown for the period must fall by the refund amount, and the income KPI must not move. | |
| BR-030 | Card statement cycle | Untested | With `statement_day` / `payment_day` / `billing_account_id` set on a credit card, `get_card_cycle_summaries` must return payable, outstanding, statement balance, paid-since-close and overdue state consistent with the card's own transaction list for the same window. Cross-check one closed cycle by hand. | |
| BR-045 | Time of day | Untested | Time is optional. A transaction saved without a time behaves exactly as before (same period bucket, same ordering tie-break); one saved with a time lands in the same day everywhere — transactions list, Reports, Calendar — regardless of timezone rendering. | |
| UC-9 | Recurring transfers | Untested | A same-currency recurring transfer auto-posts as **one** transaction with at least two entries and does **not** appear as income or expense in Reports. A cross-currency template must be refused auto-posting in all three places (form toggle disabled, server action refuses, job flags and skips) — this is the accepted limitation, so the check is that the refusal holds, not that it posts. | |
| BR-044 | Notes | Untested | Notes are household-scoped and RLS-isolated. Create one, confirm it is visible to the household and carries no financial side effect: no entry, no allocation, no balance movement. | |
| BR-037 | Calendar | Untested | Calendar and Reports read the same rows (`src/lib/analysis/`). Pick one month and confirm the calendar's per-day totals sum to the Reports total for the same period and filters. | |
| BR-039 | Transfer-as-expense | Untested | The row reaches KPIs, trend, week rows and the calendar but **never** the category breakdown, and never touches balances, net worth or budgets. Confirm both halves: it appears where it should, and the breakdown/balances are untouched. The on-screen note saying so must be present in Reports and Calendar. | |
| BR-043 | Budget comparison + payment split | Untested | The comparison figures reconcile against `transaction_allocations` for the same period, and the payment split does not double-count a payment across the split legs. | |
| BR-036 | Custom month start day | Untested | With a non-default `month_start_day`, Reports uses the custom period (`src/lib/periods/month.ts`) while budgets, month closures and the dashboard still use the calendar month. The figures for the same month name are therefore expected to **differ** — the check is that the difference is exactly the boundary days, and that the on-screen statement of the inconsistency is shown. Slice 2 is what removes it. | |
| BR-031 | Multi-currency entry | Untested | The **create** transaction form shows the base-currency preview and the paired transfer-amounts card. The **edit** forms do not — that is BR-031 slice 2, not a bug. Confirm a foreign-currency transaction created through the form stores the rate it was booked at, and that editing it does not silently drop that rate. | |

---

## QA Summary

- Passed: none yet — this pass has not been run.
- Failed: none observed.
- Doubts: BR-030 and BR-043 are the two rows most likely to need a hand
  reconciliation rather than a glance, because both aggregate across a window.
- Untested: all eleven rows.
- Bugs found: none yet.
- Recommended next sprint/fix: run BR-039, BR-040 and BR-035 first. All three
  are ledger-shaped — each one is a claim that money does *not* move somewhere —
  so a silent failure there is the most expensive kind, and the checks are the
  cheapest to perform.
