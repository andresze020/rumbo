# Financial Correctness Checks

## Status

**Implemented.**
No database schema changes required. BR-006 adds a lightweight SQL check file at
`supabase/tests/br_003_006_money_invariants.sql`.

The project still does not have an automated test runner in `package.json`; the
current practical coverage is a repeatable SQL checklist for the trust-critical
ledger and FX invariants touched by BR-003 through BR-006.

---

## Context

Multi-currency import, net worth, archived-account handling, and lint cleanup all
touch trust-sensitive finance behavior. The app needs checks that can be run
after applying migrations and seeding a household with representative data.

This first slice keeps the coverage small and explicit instead of introducing a
large test framework before the app has one.

---

## Coverage

`supabase/tests/br_003_006_money_invariants.sql` checks:

- Same-currency FX lookup returns `1`.
- Missing FX lookup returns `null`.
- As-of balances exclude archived accounts.
- Transfers have no income/expense allocations.
- Same-currency posted transfers net to zero in base currency.
- Non-base CSV rows use the same non-1 FX rate on entries and allocations.
- Voided transactions do not contribute to account balances.
- Dashboard/reporting actuals come from allocations, not raw entries.

The file is intentionally read-only. It does not create, update, or delete
financial data.

---

## How To Run

1. Apply pending migrations:

```powershell
npx supabase db push
```

2. Open the SQL file:

```text
supabase/tests/br_003_006_money_invariants.sql
```

3. Replace the placeholder household ID.
4. Run the SQL in a session authenticated as a member of that household.
5. Confirm every `passed` column returns `true`.

---

## Follow-Up

A future BR should add a real automated runner, either SQL-based or Vitest-based,
once the project chooses a test stack. Until then, these SQL checks are the
minimum repeatable gate for money-math regressions.
