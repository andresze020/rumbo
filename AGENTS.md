# AGENTS.md — Rumbo

> Canonical project-state document. Keep this in sync at every sprint close
> (see the `rumbo-state-sync` skill). If this file and the code disagree,
> the code wins — and this file is the bug.

## Project context

This is Rumbo, a personal/family finance PWA.

Stack:
- Next.js (App Router) + React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui + Base UI + Recharts
- @dnd-kit (drag-and-drop account sorting)
- Supabase Auth + Supabase/PostgreSQL (SSR configured)
- Zod for validation
- @anthropic-ai/sdk (AI assistant feature)
- GitHub + Vercel

The product is household-first. All financial data must belong to a household.

## Current status

- **BR-030 / BR-043 audited, two refund bugs fixed** (2026-09-30, #84-#86).
  Both migrations applied; new subagents `verify-runner` and `qa-smoke`. Full
  detail in `docs/SPRINT-LOG.md`.
- **RUM-010b: the release gate exists** (2026-09-24, PR #79). See
  `docs/release-checklist.md`; full detail in `docs/SPRINT-LOG.md`.
- **B-7 fixed, B-8 decided** (2026-09-25). Dashboard month-nav `<Suspense>`
  fix + BR-040 refunds netting; full detail in `docs/SPRINT-LOG.md`.
- **RUM-005 closed: 30 s Router Cache** (2026-09-25). Rule: every Server
  Action that writes (or signs in or out) must call `revalidatePath`; full
  detail in `docs/SPRINT-LOG.md`.
- **Dashboard redesign + Transactions first load, then a premium pass**
  (2026-09-25 → 09-26). See
  [`docs/features/dashboard-layout.md`](docs/features/dashboard-layout.md);
  full detail in `docs/SPRINT-LOG.md`.
- **The Transactions screen was rebuilt as a phone list, and the period got
  one owner** (2026-09-19 → 09-20, PR #66). Full detail in
  `docs/SPRINT-LOG.md`.
- **The category moved to the top of the add-transaction form, and the form
  now fits one phone screen** (2026-09-15, PR #64). Full detail in
  `docs/SPRINT-LOG.md`.

> **Historia anterior:** las entradas de sprint previas viven en
> `docs/SPRINT-LOG.md` (append-only, más reciente arriba). No se resumen aquí:
> leerlas en cada sesión costaba ~9k tokens que casi nunca se usaban. Consulta
> el log solo cuando necesites el porqué de una decisión pasada.

- See `docs/alpha/sprint-12-alpha-plan.md` for the live Alpha plan,
  `docs/alpha-readiness-checklist.md` for the readiness gate, and
  `docs/pending-work.md` for a single index of every open feature, BR
  backlog item, and cross-feature Open Decision.
- **Backlog RUM-001…RUM-010b** (performance e integridad financiera):
  `docs/performance-ux-backlog.md` es la fuente de verdad, con un prompt
  listo por ticket y un contrato de ejecución compartido en su §4. El avance
  vive en `docs/performance-ux-execution-status.md`. Antes de trabajar
  cualquier RUM-*, lee la §3.4 del backlog: varias hipótesis del diagnóstico
  original resultaron falsas contra el código.
- Benchmarks: `docs/benchmark-review-monarch-ynab-copilot.md` (web/product
  competitors, source of BR-001…BR-029) and
  `docs/benchmark-review-mobile-money-managers.md` (mobile capture
  competitors, source of BR-030…BR-047: BR-030…041 added 2026-07-27, BR-042…047
  added 2026-07-28 after a screen recording of App B confirmed BR-030's
  credit-card cycle live and surfaced six further gaps). The mobile doc is
  the self-sufficient record of two screen-recording reviews — it lists what
  we already ship (§5.1) so those patterns are not re-proposed, and what
  neither recording showed (§9).

## Real Supabase tables (public schema)

- profiles
- households
- household_members
- currencies
- accounts
- categories
- transactions
- transaction_entries
- transaction_allocations
- budgets
- budget_lines
- debts
- exchange_rates
- recurring_transactions
- goals
- payees
- import_batches
- import_rows
- tags
- transaction_tags
- csv_import_presets
- categorization_rules
- recurring_autopost_log
- month_closures
- notes (BR-044)
- installment_plans (BR-035)

`npx supabase migration list --linked` reported 59/59 on 2026-08-21 (58/58 on
2026-08-12, the day Tier-3 and Tier-4 were merged and pushed, plus
`20260817120000_balance_fx_revaluation.sql` confirmed applied since).
`20260921120000_multi_date_account_balances.sql` (RUM-006) applied 2026-09-21
— `npm run db:status` reports 60/60, nothing pending. It shipped with one real
bug caught only by applying it: `account_id` is also an OUT-parameter name in
the function's `returns table`, so a bare (unqualified) reference to it inside
the query body raised `column reference "account_id" is ambiguous` — invisible
while the SQL was only validated loose, outside a real PL/pgSQL function. Every
reference to any OUT column is now qualified with its CTE's alias; see the
migration's own comment at the `running` CTE. `npm run db:test -- --file=rum_006`
passes all 5 checks against production.
64/64 applied on 2026-09-30 (checked in `supabase_migrations.schema_migrations`).
Applied since RUM-006: RUM-004 RLS (2026-09-24), B-8 (2026-09-25) and
`20260930120000_br_043_refund_payment_split.sql` +
`20260930130000_br_030_refund_card_cycle.sql` (2026-09-30), both verified in
`supabase_migrations.schema_migrations`. Run `npm run db:status` for the
current count.

Migrations live in `supabase/migrations/` (timestamped `YYYYMMDDHHmmss_*.sql`).

## Key areas of the app

- `src/app/dashboard/` — accounts, categories, payees, tags, notes,
  transactions, budgets, plan, debts, net-worth, recurring, installments, goals,
  rules (categorization), export, settings, assistant (AI), more (mobile), plus
  the analysis/planning screens: reports, trends, cash-flow, calendar,
  month-review, debt-planner.
- `src/lib/supabase/{client,server,middleware}.ts` + `src/proxy.ts` — auth/SSR
  (renamed from `src/middleware.ts` in Sprint 13, per Next 16 convention).
- `src/lib/` — `format.ts`, `fx.ts`, `calc.ts`, `account-display.ts`, `recurring/`,
  `imports/`, `exports/`, `rules/`, `goals/`, `categories/`, `accounts-view/`,
  `nav/`, `i18n/`, `ai/`, `health/score.ts` (the documented health score, shared
  by dashboard + month-review), `preferences/` (BR-032/038 `ui_preferences`),
  `filters/transaction-scope-memory.ts` (the `af_tx_scope` cookie),
  `app-scroll.ts` (**the** dashboard scroll container — `window.scrollY` does
  not work there; see `docs/features/mobile-app-shell.md`),
  `use-back-dismiss.ts` (overlay Back handling),
  `analysis/server.ts` + `analysis/report-query.ts` (shared data helpers for the
  analysis screens; Reports and Calendar read the same rows),
  `cards/cycle.ts` (BR-030 statement-cycle dates), `installments/shared.ts`
  (BR-035 split + dates), `periods/month.ts` (BR-036 — the calendar/custom
  month-start-day resolver used by budgets, month closures and the dashboard;
  do not re-derive month boundaries anywhere else), `periods/transaction-period.ts`
  (PR #66 — the Transactions screen's own period parser: one `TransactionPeriod`
  from the URL feeds the RPC bounds, totals, date headers and the period
  control's label; a separate concern from `periods/month.ts`, not a
  duplicate), `households/server.ts` (`getHouseholdContext`, PR #66 — read
  once in the dashboard layout to feed the app-bar household selector on every
  screen), `perf/` (RUM-001 — query instrumentation, **off unless
  `RUMBO_PERF=1`**; `collector.ts` wraps the Supabase client's `fetch`, so no
  call site needs editing to be measured, and `label.ts` drops filter values
  before anything is logged. See `docs/performance-baseline.md`), `balances/`
  (RUM-006 — `groupByAsOfDate()`, the one place Dashboard, Net worth and
  Accounts turn `get_account_balances_as_of_many`'s flat rows into per-date
  arrays; don't re-duplicate this loop in a fourth call site).
- `src/components/ui/` — `alert-dialog.tsx` (Sprint 13) alongside the existing
  `dialog.tsx`; use for destructive-action confirms instead of an inline
  confirm-state pattern.
- `src/components/` — shared design system (PageHeader, SectionHeading, Callout,
  Money, BalanceAmount, AccountAvatar, AccountGroup, AccountsViewToggle,
  CategoryStylePicker, FormDialog, AmountInput, SearchablePicker (MQ-008: long
  lists — search sheet on a phone, `<optgroup>` select on desktop), FlashToast
  (MQ-019: a redirect's `?flag=1` success confirmation as a self-dismissing
  toast instead of a pinned success Callout), etc.).
  Reuse these; do not re-roll primitives.

## Technical rules

- Use small, safe, additive SQL migrations. Do not apply a big-bang schema.
- Do not introduce Java.
- Do not bypass RLS. Do not use the Supabase service-role key in app code.
- Use server actions for writes.
- Prefer simple, readable code over abstractions.
- Use TypeScript types where practical.
- Run checks before final answer (see the `rumbo-verify` skill):
  - `npm run lint`
  - `npx tsc --noEmit`  (there is no `typecheck` npm script)
  - `npm test`  (Vitest unit suite — no database, runs in ~200 ms)
  - `npm run build` when feasible
  - `npm run db:local` when the change touches migrations, RPCs, RLS or
    `supabase/tests/` (also runs in CI)
- The typecheck above is also enforced by a `Stop` hook, so a turn that leaves
  broken types cannot be closed. Subagents, slash commands and hooks are
  documented in `docs/ai-agents-workflow.md`.
- The `zoho-*` skills visible in some sessions belong to a different project.
  Never use them here.

## Tests

Three layers, no overlap. Full conventions and the stack decision live in
`docs/testing.md`; what a release must pass is `docs/release-checklist.md`.

- **Performance — `npm run perf:census`** (static round-trip count per route, no
  credentials) and **`npm run perf:baseline`** (database timings, read-only,
  runs against the live project). Neither is part of the gate. Method, findings
  and the tables they fill: `docs/performance-baseline.md`.
- **Vitest unit suite — `npm test`** (RUM-010a, 2026-09-21). Pure logic only:
  no database, no credentials, no browser. Part of the gate above and of
  `.github/workflows/ci.yml`. `npm run test:watch` while working.
  - Tests are **co-located** with their subject as `<module>.test.ts`
    (`src/lib/health/score.ts` → `src/lib/health/score.test.ts`;
    `scripts/db-test.mjs` → `scripts/db-test.test.ts`).
  - Shared fixtures go in `tests/fixtures/` as typed TypeScript modules, never
    JSON, and only once a second test file needs them.
  - Expected values are literals, not expressions re-deriving the formula under
    test. Confirm a new test fails when you break the code it covers.
  - Config: `vitest.config.mts` (`@/…` → `src/…`, node environment, no globals).
  - Seeded with 11 tests over `src/lib/health/score.ts`.
- **SQL invariants on fixtures — `npm run db:local`** (RUM-010b). Starts a
  private Postgres from the stock server binaries (no Docker, no credentials),
  applies `supabase/local/supabase-shim.sql` + every migration unmodified,
  loads `supabase/local/fixtures.sql` (2 households, ~3.5k transactions, every
  edge case, written through the app's RPCs under RLS), and runs every file in
  `supabase/tests/` for both households — `run-as=non-member` files as the other
  household's owner and as a user with no household — plus
  `supabase/local/fixture-expectations.sql`. ~20 s, in CI on every PR. Run it
  whenever a change touches migrations, RPCs, RLS or `supabase/tests/`.
  `--keep` leaves the cluster up; `--bench` times the reporting RPCs.
- **SQL invariants on the live project — `npm run db:test`**. The same files
  in `supabase/tests/`, against the **live** project via the Management API,
  read-only. Not in CI: there is no staging copy of that database. Step 3 of
  the release checklist.
  - **Pass `--user=<a member's uuid>` for any check that calls an
    `is_household_member()`-gated RPC** (`get_account_balances`,
    `get_exchange_rate(_as_of)`, `get_account_balances_as_of_many`). Without
    it the runner connects as `postgres`, which bypasses table RLS as the
    owner but does not satisfy a `SECURITY DEFINER` function's own
    `auth.uid()` check — that check fails outright, not permissively, with no
    JWT set. `br_003_006_money_invariants.sql` had been silently unrunnable
    this way since it was written; found and fixed 2026-09-21 (RUM-006).
    Every check in the suite ran successfully for the first time that day:
    31 passed, 1 failed (`BR-006 official balances match posted/pending
    entries only`). RUM-010b found why: the check summed the entries of voided
    transactions (a LEFT JOIN kept them); fixed 2026-09-24.
  - Two file-format additions (RUM-010b): `-- rumbo-test: run-as=non-member`
    makes a file run as a user outside the household, and a `do` block named
    by a `-- check: <name>` line passes by finishing without an error.
- **Navigation — `npm run perf:nav`** (RUM-010b). Real Chromium against a
  running app and a test account: the §3.1 flows cold and warm, p50/p75/p95
  until no skeleton is left, and lost navigations (exit 1 if any).
  `--think=<ms>` adds an untimed pause before each flow (a person's pace).
  Report both paces when a change makes pages appear faster (RUM-005).

## Git rules

- Canonical checkout: `C:\Users\Andres\Documents\Projects\app-finanzas`.
  Codex and Claude Code must use this same checkout by default. Do not create
  additional Git worktrees unless the user explicitly requests an isolated
  worktree. Use regular branches in this checkout and return it to `main` after
  closing and publishing the work.
- Work on a branch, not directly on main.
- Use small, logically separable commits.
- Before making code changes, explain the plan.
- Before committing, show the diff summary.
- Never run destructive git commands (`reset --hard`, `push --force`, `clean -f`,
  `branch -D`) without explicit confirmation.
- Only create branches, commit, push, merge, or tag when the user explicitly asks.

## Database/Supabase rules

- Do not run `npx supabase db push` automatically.
- Prepare migrations only and list the exact manual Supabase command for the user.
- From a cloud session `npx supabase db push` cannot work at all: it needs TCP
  5432, and cloud egress is HTTP/HTTPS only. Use `npm run db:status` /
  `node scripts/db-push.mjs push --apply`, which applies the same migrations over
  the Management API. See `docs/db-push-over-https.md`. Same rule as above — only
  when the user asks.
