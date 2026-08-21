# Exchange Rates

## Status

**Implemented.**
Migration `20260613000100_br_001_csv_import_fx.sql` adds the household-scoped
`exchange_rates` table and the `get_exchange_rate(...)` RPC.

**Balance revaluation — added 2026-08-17**, migration
`20260817120000_balance_fx_revaluation.sql`. Both `get_account_balances`
overloads now convert an account's balance into base currency at the rate on
file for the date being shown, instead of summing each movement's frozen rate.
`get_exchange_rate_as_of(...)` is the new lookup (rate **and** its date);
`get_exchange_rate` keeps its exact signature and contract and delegates to it.
A rates editor lives in Settings. **Not applied yet** — see Manual commands.

This is the BR-002 FX data-model foundation. BR-001 uses it for CSV import FX
correctness and account balances now use it too; future cross-currency
transfers, debt payments and recurring auto-posting can build on the same
lookup contract.

---

## Context

App Finanzas stores transaction amounts in both account currency and household
base currency. Before BR-002, rates existed only as frozen values on individual
ledger rows. That made CSV import and future unattended multi-currency flows
depend on ad hoc rate handling.

The exchange-rate foundation gives each household a small historical rate table
with a deterministic lookup RPC.

---

## Architecture

### Table

`public.exchange_rates`

| Field | Purpose |
|---|---|
| `household_id` | Household owner for RLS isolation. |
| `from_currency_code` | Currency being converted from. |
| `to_currency_code` | Currency being converted to. |
| `rate` | Conversion multiplier: `1 from_currency_code = rate to_currency_code`. |
| `rate_date` | Historical date for the rate. |
| `source` | Rate source, defaulting to `manual`. |
| `notes` | Optional context for a manually-entered rate. |
| `created_by`, `updated_by` | User audit fields. |

The migration adds:

- Foreign keys to `households` and `currencies`.
- A positive-rate constraint.
- A distinct currency-pair constraint.
- A unique `(household_id, from_currency_code, to_currency_code, rate_date)`
  index.
- A lookup index on `(household_id, from_currency_code, to_currency_code,
  rate_date desc)`.
- RLS policies for household members/editors.

### RPC

`public.get_exchange_rate(p_household_id, p_from_currency, p_to_currency, p_rate_date)`

Lookup order:

1. Return `1` when `from_currency = to_currency`.
2. Return the direct pair's exact or latest-prior rate.
3. Return the inverse of the reverse pair's exact or latest-prior rate.
4. Return `null` when no usable rate exists.

The RPC is `security invoker`, checks authenticated household membership, and
relies on the table's RLS policy for row visibility.

---

## Verification Queries

After applying the migration, run these with real household/user context. Replace
the placeholder IDs and dates.

```sql
-- Same-currency lookup returns 1.
select public.get_exchange_rate(
  '<household-id>'::uuid,
  'CAD',
  'CAD',
  '2026-06-13'::date
);

-- Direct latest-prior lookup.
select public.get_exchange_rate(
  '<household-id>'::uuid,
  'COP',
  'CAD',
  '2026-06-13'::date
);

-- Missing-rate behavior returns null.
select public.get_exchange_rate(
  '<household-id>'::uuid,
  'USD',
  'COP',
  '1900-01-01'::date
);

-- Confirm RLS is enabled.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'exchange_rates';
```

---

## Manual Supabase Step

Do not run this automatically from Codex. After reviewing the migration, apply
it with:

```powershell
npx supabase db push
```

---

## Balance revaluation: a stock is not a flow

A foreign-currency account's balance in base currency used to be
`sum(transaction_entries.amount_base_currency)` — every movement frozen at the
rate it was booked at. That is a **cost basis**, and it drifts from reality
without limit as rates move. A COP account holding 29 262 996 COP read as
≈ 9 647 CAD (the blended rate of four years of history) on a morning those pesos
were worth ≈ 13 278 CAD. Nothing was wrong with the arithmetic; the number just
answered a different question than the one the screen appeared to ask.

The rule the migration draws:

| | Valued at | Why |
|---|---|---|
| **Stock** — an account balance at a point in time | the rate in effect on **that date** | It is what the money is worth then. |
| **Flow** — income, an expense, a budget line | the rate of **its own transaction date** | Last year's groceries are not restated at today's rate. |

So only `get_account_balances` changed. `transaction_entries` and
`transaction_allocations` are untouched, which means every report, budget and
month closure built on allocations reads exactly as it did before. Net worth,
the accounts screen, the plan and debt screens all read balances, so they all
move together.

### Fallback

When the household has no usable rate for a pair at or before the date, the
base-currency columns fall back to the historical sum — the exact previous
behaviour. A household that never enters a rate sees no change at all. The
functions return `base_conversion_rate` / `base_conversion_rate_date` so the UI
can tell the two apart; the accounts screen shows a notice naming the currencies
that fell back.

### Precision of the history

`get_exchange_rate_as_of` returns the newest rate dated **on or before** the day
asked about. With one rate on file, every month before it falls back to the
historical sum and the net-worth line will step at the month that rate is dated.
That step is real — it is the gap between cost basis and market — but it looks
like an event. Saving a rate per month for the periods worth the effort smooths
it into the actual currency movement.

### Entering rates

Settings → Exchange rates, one form per foreign currency the household holds
accounts in. The stored `rate` is the direct multiplier (`1 from = rate to`),
but that is the awkward direction to type for a currency like COP
(`0.00045375`), so the form edits both directions and mirrors them; only the
direct one is submitted. Saving twice on the same date corrects that date's rate
rather than stacking a row — `exchange_rates_unique_household_pair_date` is the
conflict target.

---

## Manual commands

```powershell
npx supabase db push
```

The assertion suite in `supabase/tests/br_003_006_money_invariants.sql` covers
this: `BR-006 official balances match posted/pending entries only` now checks
the **account-currency** column (the currency-neutral truth — it was written
against the base column, which is no longer a plain sum of entries), and a new
`FX balances revalue at the rate on file, else fall back to the entry sum`
states the conversion rule itself.

Then, as an authenticated member of the household:

```sql
-- Base-currency accounts convert at 1 and are never "missing a rate".
select currency_code, base_conversion_rate, base_conversion_rate_date
from public.get_account_balances('<household-id>'::uuid);

-- After saving a COP rate in Settings, the equivalent should match the market.
select account_name, posted_balance_account_currency, posted_balance_base_currency
from public.get_account_balances('<household-id>'::uuid)
where currency_code = 'COP';
```
