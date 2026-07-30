# Refunds as negative amounts (BR-040) — modelling decision

The BR-040 row requires a written decision **before** any code, because the
question is whether `transaction_allocations` tolerates negative amounts without
breaking budget actuals, dashboard sums and the checks in `supabase/tests/`.

Decision made 2026-07-30. Migration `20260730160000_br_040_refunds.sql`.

## The finding

**It did not.** `transaction_allocations` carried two CHECK constraints:

```sql
constraint transaction_allocations_amount_original_positive_chk
  check (amount_original_currency > 0),
constraint transaction_allocations_amount_base_positive_chk
  check (amount_base_currency > 0),
```

So a negative allocation was refused by the database outright. Everything else was
already fine:

- Every reporting query sums `amount_base_currency`, so a negative row would net
  correctly with no arithmetic change.
- The invariant in `supabase/tests/br_003_006_money_invariants.sql` asserts
  `allocation_actuals <= entry_movements` (reporting actuals are allocation-based).
  A negative allocation makes the left side *smaller*, so the check still holds.

## Options weighed

**A — allow negative allocations.** The refund is an `expense` allocation with a
negative amount. Every `sum(...)` nets automatically: dashboard, category reports,
budget actuals, month closures, trends, and the two BR-043 budget functions all
become correct with **no change to any of them**.

**B — keep allocations positive, put the sign in the type.** A new
`allocation_type = 'expense_refund'`, with reporting computing
`sum(expense) − sum(expense_refund)`.

B looks safer, and was the first instinct. It is not the better answer:

- Every existing query filters `allocation_type = 'expense'`, so under B a refund
  is **invisible until each query opts in**. Delivering the row's actual promise —
  *"the category nets to the true cost"* — would mean editing five shared
  financial SQL functions (`get_monthly_dashboard_summary`,
  `get_monthly_expenses_by_category`, `get_monthly_budget_details`, plus BR-043's
  `get_budget_previous_actuals` and `get_budget_payment_split`, which copy the
  budget predicate verbatim and must not diverge from it).
- That is a large, risky rewrite of shared money SQL for a **P3** ticket — the
  exact cost BR-039 declined to pay for its own reporting flag.

## What tipped it: the constraint can be narrowed, not dropped

The one real objection to A was losing a database-enforced invariant: a CSV-import
bug could silently write a negative allocation where today it throws loudly.

That objection dissolves once the constraint is made **type-aware** instead of
being removed:

```sql
check (
  case
    when allocation_type = 'expense' then amount_original_currency <> 0
    else amount_original_currency > 0
  end
)
```

Negatives are permitted **only** on expense allocations. Zero is still forbidden
everywhere. A negative *income*, *financial* or *adjustment* allocation still
raises, exactly as before. The loss of strictness is confined to precisely the
case the feature needs, and nothing else gives up its guarantee.

**Chosen: A, with type-aware constraints.**

## The model

- `transactions.transaction_type` gains `'refund'`. A refund is not an expense
  (money comes back) and not income (it does not increase what the household
  earned) — the transaction list can label it honestly.
- `transactions.refunded_transaction_id` optionally links to the original expense,
  which is what makes "Record refund" on a transaction row able to prefill the
  account, category and amount.
- The **entry** is positive: money returns to the account, so the balance rises.
- The **allocation** is `expense` with a **negative** amount, in the original's
  category. That is the whole point: the category nets to the true cost.

`create_refund_transaction` writes all three, validating that the refund does not
exceed the original and that the category is an expense category.

## Consequences, checked against the row's verification list

| Check | Result |
|---|---|
| Nets correctly in budgets, category reports and the dashboard | Yes, automatically — every one of them sums `amount_base_currency`. |
| Never produces a negative *account balance* artefact | The entry is positive; a refund raises the balance. It cannot push an account negative. |
| Voiding it restores the original cost | Yes. Void sets `status = 'voided'`, and every reporting predicate filters `status = 'posted'`, so the negative allocation simply stops counting. Undo via `unvoid_transaction` (BR-015) works unchanged. |
| SQL invariants in `supabase/tests/` still pass | Yes — see the finding above. A new invariant is added asserting that a negative allocation only ever appears with `allocation_type = 'expense'`. |

## Known cosmetic edge

A category whose refunds in a month exceed its spend nets **negative**. The SQL
reports that honestly. `get_monthly_expenses_by_category` orders by amount
descending, so such a category sorts last; the donut clamps at zero for the wedge
geometry, since a negative slice has no meaningful area. The listed figure stays
the true net.
