---
name: app-finanzas-verify
description: Use before finishing any App Finanzas code task or before merging a sprint — the single source of truth for "is this ready?". Runs the real validation gate (lint, typecheck, build) plus the minimal smoke test.
---

# App Finanzas Verify

The one place that defines "ready to merge" for App Finanzas. Other skills and docs
point here instead of repeating (and drifting on) validation steps.

## The real scripts

`package.json` defines only: `dev`, `build`, `start`, `lint`. There is **no
`typecheck` script** — typecheck via the compiler directly. Do not instruct anyone
to run `npm run typecheck`.

## Validation gate (run in order)

```powershell
npm run lint          # ESLint (eslint-config-next)
npx tsc --noEmit      # TypeScript typecheck — no npm script exists for this
npm run build         # Next build — run when feasible; catches RSC/route errors
```

- Lint and typecheck are mandatory before declaring a task done.
- `npm run build` is mandatory before a sprint merge; for small in-progress edits
  it may be deferred if clearly stated.
- If you cannot run a step, say so explicitly and give the user the exact command —
  never silently skip it.

## DB-touching changes

If the task added/changed migrations, the gate also includes:
- Confirm the migration is additive and named `YYYYMMDDHHmmss_*.sql`.
- List the manual Supabase command for the user (`npx supabase db push`) — never
  run it automatically.
- Provide verification queries (see `app-finanzas-supabase-rls`).

## Minimal smoke test (manual, for the user)

Only the flows the change touched, plus these always-on invariants:
1. Login reaches the dashboard.
2. Add income, expense, and a transfer.
3. Account balances and dashboard totals stay consistent.
4. Transfers do not inflate income or expenses.

Full alpha smoke list lives in `app-finanzas-alpha-qa`; use it for sprint-close QA.

## Report format

End with:

```text
Verification
- npm run lint:      <pass/fail + summary>
- npx tsc --noEmit:  <pass/fail + summary>
- npm run build:     <pass/fail/deferred>
- Manual smoke:      <what the user must click>
```
