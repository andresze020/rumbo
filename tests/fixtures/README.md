# Test fixtures

Shared data for the Vitest unit suite. See [`docs/testing.md`](../../docs/testing.md).

Rules:

- One TypeScript module per domain (`accounts.ts`, `transactions.ts`, …),
  exporting typed data. Not JSON — the compiler should check the shapes.
- Deterministic. No `new Date()` without an explicit argument, no randomness,
  no network, no Supabase.
- A fixture belongs here only once a second test file needs it. Until then it
  stays inline in the test that uses it.

Empty for now on purpose: RUM-010a seeded the runner with pure-logic tests that
need no fixtures. The multi-year household fixtures (RUM-010b) are SQL loaded
through the app's RPCs into a local Postgres, so they live in
[`supabase/local/`](../../supabase/local/) — see `npm run db:local` in
[`docs/testing.md`](../../docs/testing.md).
