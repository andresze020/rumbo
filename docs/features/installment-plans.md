# Installment purchases (BR-035)

Shipped 2026-07-30. Migration `20260730150000_br_035_installment_plans.sql`.
Screen: `/dashboard/installments` (Planning nav group).

Directly relevant to COP/LATAM card usage — *meses sin intereses*. Before this, a
12-month plan had to be faked as a recurring template, which has no end-total and
no *n of N* position.

## Why this is not `recurring_transactions`

The BR-035 row says so explicitly, and the two differ in kind:

| | Recurring template | Installment plan |
|---|---|---|
| Duration | Open-ended | Fixed count, known at creation |
| Amount | A guess that may change | A fixed total, known at creation |
| Purpose | "this happens again" | "divide this total into N" |

Overloading one table would have meant nullable columns that are meaningless on
half the rows, plus an auto-post job that has to tell two kinds of schedule apart.

## The model: the plan holds no money

`installment_plans` is **metadata**. It has no ledger entries and no allocation.
All of the money lives in the N generated child transactions, each an ordinary
expense of `total / N`, linked back by `transactions.installment_plan_id` and
`installment_number`.

This is what satisfies the row's *"reports do not double-count the parent and its
children"* check **by construction** rather than by a filter someone has to
remember: there is no parent transaction to double-count. **Nothing changed in
any report, budget or monthly RPC** — an installment is just an expense that
happens to know which plan it came from.

Consequences, all of them wanted:

- This month's report shows this month's installment — what the household
  actually pays this month.
- Future installments are posted, so they show up in future months' reports as
  already-committed spend, and the card's all-time balance shows the full amount
  owed.
- **BR-030 places them correctly with no extra work**: a future-dated installment
  falls after the statement close, so it lands in `outstanding` and never in
  `payable`.

## Rounding

`total / N` rarely divides evenly. Every installment gets the same amount rounded
to cents and the **last one absorbs the remainder**, so the N amounts sum to the
original total exactly — the row's first verification, and the number a household
checks against its card statement.

This lives twice, in `create_installment_plan` and in
`src/lib/installments/shared.ts`, because the form previews the split *before*
saving (saving writes N real transactions, which should never be a surprise). A
preview that disagreed with what got written would be worse than no preview, so
both are deliberately short enough to compare side by side.

Dates clamp the day into the target month: a plan starting Jan 31 bills Feb 28,
not Mar 3 — the same rule `advance_recurring_next_run` uses.

## Creation is atomic

`create_installment_plan` writes the plan and all N installments in one
statement, so a partial plan — some installments posted, some missing — cannot
exist. It mirrors `create_manual_transaction`'s validation and ledger writes,
because each installment *is* an ordinary expense.

## Cancelling / early payoff

`cancel_installment_plan` voids only the installments that have **not come due
yet** (`transaction_date > as_of`); the ones already billed are real history and
stay. It uses the same void columns as `void_transaction`, so a voided
installment behaves like any other voided row and can be restored individually
with `unvoid_transaction` (BR-015). The plan is marked `cancelled`, never deleted
— archive-over-delete, as with goals, tags, payees and notes.

Plan progress on screen is **derived from the installments**, not stored on the
plan, so an early payoff is reflected without a second source of truth to keep in
sync.

## Account archive

`installment_plans.account_id` is a plain reference with no `on delete` clause,
and archiving an account only sets a flag. The plan and its installments survive
untouched — the row's third verification.

## Not in this slice

The *n of N* badge on the **transaction list**. The plan list shows each plan's
`paid / count`, which is where the position is actually asked about. Putting it on
a transaction row means adding two columns to `search_household_transactions`'
`RETURNS TABLE`, which forces another DROP-and-recreate of that function; not
worth bundling into this migration.
