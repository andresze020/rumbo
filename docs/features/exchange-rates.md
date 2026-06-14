# Exchange Rates

## Status

**Implemented.**
Migration `20260613000100_br_001_csv_import_fx.sql` adds the household-scoped
`exchange_rates` table and the `get_exchange_rate(...)` RPC.

This is the BR-002 FX data-model foundation. BR-001 uses it immediately for CSV
import FX correctness; future cross-currency transfers, debt payments, recurring
auto-posting, and net-worth FX policy can build on the same lookup contract.

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
