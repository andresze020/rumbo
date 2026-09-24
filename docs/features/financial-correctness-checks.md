# Financial Correctness Checks

## Status

**Implemented.**
No database schema changes required. BR-006 adds a lightweight SQL check file at
`supabase/tests/br_003_006_money_invariants.sql`.

These SQL checks cover the trust-critical ledger and FX invariants touched by
BR-003 through BR-006. Since RUM-010a (2026-09-21) they are no longer the only
automated coverage: the repo also has a Vitest unit runner (`npm test`) for pure
TypeScript logic. The two suites are complementary — see
[`docs/testing.md`](../testing.md).

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
- Voided transactions do not contribute to account balances. (Until RUM-010b this
  check summed voided entries anyway — a LEFT JOIN kept them — and only passed
  because the live household had no voids; the generated fixtures exposed it.)
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

~~A future BR should add a real automated runner, either SQL-based or
Vitest-based, once the project chooses a test stack.~~ **Closed twice over:**
`npm run db:test` (`scripts/db-test.mjs`) made these SQL files executable, and
**RUM-010a** (2026-09-21) added Vitest as the JS/TS unit runner, wired into the
validation gate and CI. See [`docs/testing.md`](../testing.md).

~~Still open: porting these invariants to run against seeded fixtures rather
than the live household, so they can run unattended in CI.~~ **Closed by
RUM-010b** (2026-09-24): `npm run db:local` runs every file in
`supabase/tests/` against generated fixtures in a private local Postgres, in CI
on every pull request. RUM-010b also added `rum_010b_release_invariants.sql`
and `rum_010b_household_isolation.sql`. See
[`docs/release-checklist.md`](../release-checklist.md).
