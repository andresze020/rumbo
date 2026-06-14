# CSV Import FX

## Status

**Implemented.**
Migration `20260613000100_br_001_csv_import_fx.sql` adds the household-scoped
`exchange_rates` table and updates CSV import FX behavior.

CSV imports no longer default non-base currency rows to a 1:1 exchange rate. The
migration also adds `get_exchange_rate(...)` and replaces `create_csv_import(...)`
with the same app-facing signature.

The shared exchange-rate foundation is documented in
[exchange-rates.md](./exchange-rates.md).

---

## Behavior

- Same-currency import rows use `exchange_rate_to_base = 1`.
- Non-base account rows resolve `exchange_rate_to_base` from the account
  currency to the household base currency for the transaction date.
- The lookup first uses an exact or latest-prior saved rate for the direct pair.
  If only the inverse pair exists, it returns the inverse rate.
- Rows without a usable rate are written to `import_rows` with
  `validation_status = 'invalid'` and a clear validation error. They do not
  create ledger transactions.
- Imported rows that do create transactions store the resolved rate in both
  `transaction_entries.exchange_rate_to_base` and
  `transaction_allocations.exchange_rate_to_base`; base amounts are derived from
  that rate.
- `import_rows.mapped_data` records the server-resolved `account_currency`,
  `base_currency`, and `exchange_rate_to_base` for auditability.

---

## Rate Data Contract

`exchange_rates.rate` means:

```text
1 from_currency_code = rate to_currency_code
```

For example, if `1 CAD = 3000 COP`, store:

```sql
insert into public.exchange_rates (
  household_id,
  from_currency_code,
  to_currency_code,
  rate,
  rate_date,
  source,
  created_by
)
values (
  '<household-id>',
  'CAD',
  'COP',
  3000,
  '2026-06-13',
  'manual',
  auth.uid()
);
```

A COP account imported into a CAD household can use that inverse pair; the RPC
returns `0.00033333` as the COP-to-CAD rate.

---

## Manual Supabase Step

Do not run this automatically from Codex. After reviewing the migration, apply
it with:

```powershell
npx supabase db push
```

---

## Verification

Minimum checks for this BR:

1. Seed a non-base exchange rate for a household.
2. Import a CSV row into a non-base account.
3. Confirm the created transaction entry and allocation use the resolved
   `exchange_rate_to_base`.
4. Import another non-base row dated before any saved rate and confirm it is
   logged as invalid rather than imported at 1:1.
5. Run `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
