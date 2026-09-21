---
name: rumbo-verify
description: Use before finishing any Rumbo code task or before merging a sprint — the single source of truth for "is this ready?". Runs the real validation gate (lint, typecheck, build) plus the minimal smoke test.
---

# Rumbo Verify

The one place that defines "ready to merge" for Rumbo. Other skills and docs
point here instead of repeating (and drifting on) validation steps.

## The real scripts

`package.json` defines: `dev`, `build`, `start`, `lint`, `test`, `test:watch`,
`i18n:check`, `db:status`, `db:push`, `db:test`. There is **no `typecheck`
script** — typecheck via the compiler directly. Do not instruct anyone to run
`npm run typecheck`.

## Validation gate (run in order)

```powershell
npm run lint          # ESLint (eslint-config-next)
npx tsc --noEmit      # TypeScript typecheck — no npm script exists for this
npm test              # Vitest unit suite — no database, ~200 ms (RUM-010a)
npm run build         # Next build — run when feasible; catches RSC/route errors
```

- Lint, typecheck and `npm test` are mandatory before declaring a task done.
- `npm run build` is mandatory before a sprint merge; for small in-progress edits
  it may be deferred if clearly stated.
- If you cannot run a step, say so explicitly and give the user the exact command —
  never silently skip it.

### Tests

- `npm test` runs Vitest over pure logic. It needs no database, no credentials
  and no browser, so there is never a reason to skip it.
- If the change touched logic that has a `*.test.ts` sibling, update it. If it
  touched pure logic with no test yet, add one — the runner exists now.
- `npm run db:test` (the 5 SQL invariant files in `supabase/tests/`) is a
  separate suite that runs against the **live** project. Run it when the change
  touches the ledger, transfers, refunds, installments or goals — never as a
  routine step, and never in CI.
- Conventions, the stack decision and what belongs in which suite:
  `docs/testing.md`.

## DB-touching changes

If the task added/changed migrations, the gate also includes:
- Confirm the migration is additive and named `YYYYMMDDHHmmss_*.sql`.
- List the manual Supabase command for the user (`npx supabase db push`) — never
  run it automatically.
- Provide verification queries (see `rumbo-supabase-rls`).

## Minimal smoke test (manual, for the user)

Only the flows the change touched, plus these always-on invariants:
1. Login reaches the dashboard.
2. Add income, expense, and a transfer.
3. Account balances and dashboard totals stay consistent.
4. Transfers do not inflate income or expenses.

Full alpha smoke list lives in `rumbo-alpha-qa`; use it for sprint-close QA.

## Report format

End with:

```text
Verification
- npm run lint:      <pass/fail + summary>
- npx tsc --noEmit:  <pass/fail + summary>
- npm test:          <pass/fail + N tests>
- npm run build:     <pass/fail/deferred>
- Manual smoke:      <what the user must click>
```
