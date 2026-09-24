# Testing — stack, conventions and gate

## Status

**Implemented (RUM-010a, 2026-09-21).** Vitest is the JS/TS unit runner.
`npm test` runs it; it needs no database, no browser and no credentials. The
five SQL invariant files in `supabase/tests/` are unchanged and still run with
`npm run db:test`. No schema, RLS or ledger change.

Ticket: [`performance-ux-backlog.md` §7 · RUM-010a](../performance-ux-backlog.md).

**Extended (RUM-010b, 2026-09-24).** The SQL invariants now also run against
**generated fixtures** in a throwaway local Postgres — `npm run db:local`, in CI
on every pull request — and `npm run perf:nav` times the §3.1 navigation flows in
a real browser. What a release must pass is in
[`release-checklist.md`](./release-checklist.md).

---

## Context

Until this landed the repository had no JS/TS test runner at all — no Vitest,
no Jest, no Playwright, not a single `*.test.*` file (backlog §3.4 #16). Every
RUM ticket that promised "add tests" had nowhere to write them, and
`docs/features/financial-correctness-checks.md` had carried the gap as an open
follow-up since BR-006. RUM-010a exists to unblock that, and nothing else.

---

## Decision: Vitest

Picked over the alternatives for a Next.js 16 + React 19 + TypeScript app:

| Option | Why not |
|---|---|
| **Jest** | Needs `next/jest`, Babel or SWC transform config and ESM workarounds. The repo is ESM-first (`.mjs` scripts, `esnext` modules); Jest's CommonJS default fights that. Slower cold start, more config surface to keep alive. |
| **`node --test`** | Zero install, but no TypeScript without a loader, no `expect`-style assertions, no watch UI, and no path-alias resolution. We would end up rebuilding a third of Vitest by hand. |
| **Playwright** | Solves a different problem (E2E against a running app and a real database). Explicitly out of scope for this ticket, and it would not cover pure functions cheaply. |

**Vitest** wins on three points that matter here:

1. **TypeScript, ESM and the `@/…` alias work out of the box.** One config file
   (`vitest.config.mts`, 30 lines including comments), one dev dependency.
2. **It matches the stack.** Next 16 builds on the same Rollup/esbuild-era
   tooling Vitest is built for; the transform pipeline is not a second,
   divergent way of reading our TypeScript.
3. **It stays cheap.** The seed suite runs in ~200 ms, so putting it first in
   the gate costs nothing and the feedback loop stays usable in watch mode.

**Cost paid:** `@types/node` moved from `^20` to `^22`. Vitest 5 requires
`^22 || >=24`, and Node 22 is what CI (`.github/workflows/ci.yml`) and local
development already run — the old `^20` was the stale value, not the new one.

---

## Conventions

**Unit tests live next to their subject**, as `<module>.test.ts`:

```
src/lib/health/score.ts
src/lib/health/score.test.ts
```

Co-location over a mirrored `tests/` tree because it keeps a function and its
examples in the same diff, and makes an untested module visible in the file
list. Tests are excluded from nothing else: `next build` ignores them (they are
not routes), ESLint lints them like any other source file, and `tsc --noEmit`
typechecks them.

**Fixtures live in `tests/fixtures/`** as plain TypeScript modules exporting
typed data — not JSON, so the shapes are checked by the compiler. Anything a
second test file needs belongs there rather than in a sibling test.

**What goes where:**

| Suite | Command | Covers | Needs a database |
|---|---|---|---|
| Vitest unit | `npm test` | Pure logic in `src/lib/` — formulas, parsers, formatters, date/period math | No |
| SQL invariants (live) | `npm run db:test` | Ledger rules where the ledger lives: double entry, transfers, refunds, installments, goals, isolation | Yes (runs against the linked project, read-only) |
| SQL invariants (fixtures) | `npm run db:local` | The same files, against generated multi-year data for two households, as member and as non-member | A private local Postgres it starts and deletes itself — no credentials |
| Navigation | `npm run perf:nav` | §3.1 flows cold and warm, p50/p75/p95, lost navigations | A running app and a test account |

The two do not overlap and neither replaces the other. A rule that is enforced
by a constraint or an RPC is tested in SQL; a rule that is computed in
TypeScript is tested in Vitest.

**Write tests that fail for the right reason.** Expected values are literals,
not expressions derived from the code under test — a test that recomputes the
formula it is checking passes for every possible formula. Each seed test in
`score.test.ts` was verified by deliberately breaking the source (weights,
neutral-savings default, budget band, grade boundary, savings anchor) and
confirming the suite went red each time.

---

## Seed coverage

`src/lib/health/score.test.ts` — 11 tests over the BR-021 month-health score
(`src/lib/health/score.ts`): the savings sub-score anchors and clamping, the
neutral treatment of an unknown savings rate, the budget-adherence band, the
65/35 weighting, integer output inside 0–100, monotonicity across savings
rates, and every `healthGrade()` band edge.

One thing the suite documents rather than fixes: `savingsComponent(0.1)`
returns `75.00000000000001`, so that assertion uses `toBeCloseTo`. The
sub-scores are plain `number` arithmetic. That is context for **RUM-003**
(decimal precision), not a defect introduced here.

---

## Fixtures and the local database (RUM-010b)

`npm run db:local` (`scripts/db-local.mjs`) needs only the stock PostgreSQL
server binaries and `psql` — no Docker, no Supabase CLI, no credentials:

1. starts a private cluster in a temp dir;
2. applies `supabase/local/supabase-shim.sql` (the API roles, `auth.users`,
   `auth.uid()` read from `request.jwt.claims`) and then every migration,
   unmodified;
3. loads `supabase/local/fixtures.sql` — every write through the app's own RPCs
   as `authenticated`, so RLS and every guard apply;
4. runs every `supabase/tests/*.sql` for both fixture households, and the
   `run-as=non-member` files as the other household's owner and as a user with
   no household;
5. runs `supabase/local/fixture-expectations.sql`;
6. deletes the cluster (`--keep` leaves it running; `--bench` times the RPCs).

Both runners share one engine (`runFile` in `scripts/db-test.mjs`), so a check
means the same thing on fixtures and on the live household. Two additions to
the check-file format:

- `-- rumbo-test: run-as=non-member` on a file makes the runner execute it as a
  user outside the household (live: a random uuid).
- A `do` block preceded by `-- check: <name>` passes by finishing without an
  error, so assertion-style checks can be named.

The multi-year household fixtures live in `supabase/local/`, not
`tests/fixtures/`: they are SQL loaded through RPCs, not TypeScript data.

---

## The gate

`npm test` is now part of the validation gate, before the build:

```
npm run lint
npx tsc --noEmit
npm test
npm run build
```

`rumbo-verify` is the source of truth for that list; `AGENTS.md` and
`.github/workflows/ci.yml` follow it. CI runs the unit suite on every pull
request, and — since RUM-010b — a second job, `ledger invariants on fixtures`
(`npm run db:local -- --bench`). `npm run db:test` is still **not** in CI: it
needs credentials for the live project, and there is no staging copy of that
database. It is step 3 of [`release-checklist.md`](./release-checklist.md).
