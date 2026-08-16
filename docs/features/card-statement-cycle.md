# Credit-card statement cycle (BR-030)

## Status

**Implemented — slice 1, shipped 2026-07-30, merged to `main` 2026-08-12.**
Migration `20260730140000_br_030_card_statement_cycle.sql` adds
`accounts.statement_day`, `payment_day` and `billing_account_id` (all nullable,
both days or neither, only on `credit_card`/`debt`) plus
`get_card_cycle_summaries`. **Applied 2026-08-12.**

Slice 2 — the **`Pay`** settlement action — is deliberately not part of this
slice and is still open; see [../pending-work.md](../pending-work.md) §1.

---

## The problem

A credit card had exactly one number: its running balance. That cannot answer the
question a card-holding household asks every month — *"what do I owe on the next
payment date?"* — because the running balance mixes two things that are due at
different times:

- the **closed statement**, which is billed on the payment date, and
- **this cycle's spend**, which has not been billed at all yet.

## Schema

Three nullable columns on `accounts`:

| Column | Meaning |
|---|---|
| `statement_day` | Day of month the statement closes (1–31). |
| `payment_day` | Day of month the payment is due, in the month **after** the close. |
| `billing_account_id` | The account the card is normally paid from. |

Constraints: each day is 1–31; **both days or neither**
(`accounts_cycle_pair_chk`) — a statement day with no payment day cannot produce
a due date; the cycle is only allowed on `credit_card` / `debt`
(`accounts_cycle_type_chk`, the same shape BR-039 uses for its own restriction);
and a card cannot be paid from itself.

**A card with no cycle configured behaves exactly as it did before.** All three
columns are nullable and nothing reads them unless both days are set.

## The four figures

`get_card_cycle_summaries(p_household_id, p_as_of)` returns one row per card with
a configured cycle. Every figure is in the card's own currency and
**positive-as-owed**, which is how a statement reads — the ledger stores a charge
as a *negative* entry (see `get_account_balances`), so the function flips the sign.

| Figure | Definition |
|---|---|
| `statement_balance` | The account's balance as of the close date, sign-flipped. What the statement said you owe. |
| `paid_since_close` | Positive entries posted after the close — payments and refunds, both of which genuinely reduce what is due. |
| `payable` | `statement_balance − paid_since_close`, floored at 0. **The** "what do I owe next" number. |
| `outstanding` | Negative entries since the close: this cycle's new charges, not billed yet. |

`payable` deliberately **excludes** `outstanding`, and the two are never added
together on screen. `is_overdue` is `payable > 0` with the due date already past.

Pending transactions are excluded: a statement bills what actually posted.

## Why the function is household-scoped and plural

The BR-030 row names it `get_card_cycle_summary(account_id, as_of)`. It is
`get_card_cycle_summaries(household_id, as_of)` here because the accounts list
renders every card at once and a per-account function would mean one round trip
per card. Same shape as `get_account_balances`.

## Date math lives in two places, on purpose

- **SQL** (`card_cycle_day_in_month` + the RPC) computes the windows *alongside
  the money*, so a figure and the period it describes can never drift apart.
  This is what the accounts list displays.
- **TypeScript** (`src/lib/cards/cycle.ts`) computes windows only, for the
  **creation preview**: the App B recording showed the two cycle windows
  rendering during account creation, before any transaction exists, and there is
  no account for an RPC to read yet. It never computes money.

Both clamp the day to the target month's last day, so a statement day of 31
closes on Feb 28/29 rather than overflowing into March — the same clamping rule
`advance_recurring_next_run` uses for monthly frequencies. The two
implementations must agree; they are deliberately short enough to compare by eye.

## UI

`AccountTypeDependentFields` (was `AccountTypeWithTransferExpense`) now owns the
account-type select plus **every** field whose legality depends on the type:
BR-039's transfer-as-expense toggle and BR-030's cycle block. They share one
client component because the type is editable in the same form — rendered
separately, a user could fill in a statement day, switch the type to `checking`,
and submit a combination the database rejects.

Both account views show the payable figure and its due date in place of the bare
"Owed" label, with an overdue marker; the expanded list row adds both windows,
`paid_since_close`, and the billing account.

## Not in this slice

The **`Pay` action** that posts the settlement transfer. The BR-030 row says
explicitly not to bundle it, and it is a genuinely separate problem: it writes to
the ledger, needs its own confirm flow, and has to decide what a partial payment
means. `billing_account_id` is stored now so that slice has a source account to
read, and so the UI can already say which account the card is paid from.
