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

- **RUM-010b: the release gate exists** (2026-09-24, PR #79). `npm run db:local`
  runs every `supabase/tests/*.sql` against generated fixtures in a private
  local Postgres (in CI), `npm run perf:nav` times §3.1 navigation in a real
  browser, and `docs/release-checklist.md` holds the approval criteria, the
  metrics and the known issues. **First verdict: not approved** — Dashboard
  month navigation drops clicks (B-7), and the Transactions "Expenses" total
  ignoring refunds awaits a product decision (B-8). No migrations, no app code.

- **The Transactions screen was rebuilt as a phone list, and the period got
  one owner** (2026-09-19 → 09-20, PR #66). Three commits, one review round
  from Codex. No migrations, no schema/RLS/ledger change.
  - **Chrome cut, not content**: the eyebrow/title/description block, the
    three-tile totals card with its "in CAD" caption, the All/To review/
    Reviewed/Flagged tab strip and the amber review dot are gone. Review
    state moved to the expanded row and to a "More filters" accordion; the
    review column, RPC argument, bulk actions and filter are unchanged. Three
    rows fit on a 375×812 phone before this; six do now.
  - **Amounts are colored by direction again** — green in, red out, blue
    sideways. **This reverses the earlier "only inflows are tinted" call**,
    on explicit user request; do not "fix" it back.
  - **The period has one owner.** New `src/lib/periods/transaction-period.ts`
    parses the URL once into a single `TransactionPeriod` that drives RPC
    bounds, totals, date headers and the control's label — replacing a
    `month` (header) / `date_from`+`date_to` (filter sheet) pair that used to
    disagree silently. The filter sheet has no date fields at all. URL writes
    `period=this-month|last-month|last-3-months|last-6-months|ytd|all-time`;
    `month=`/`date_from`/`date_to` are still **read** for the dozen existing
    links elsewhere (calendar, budget rows, notes, dashboard review queue)
    that point here with them.
  - **The household moved into the app bar.** New
    `src/lib/households/server.ts` (`getHouseholdContext`) feeds a selector in
    `MobileNav`/`AppSidebar` on every dashboard screen; switching goes through
    `src/app/dashboard/household-actions.ts` (`switchHouseholdAction`), which
    re-checks active membership before writing
    `profiles.default_household_id`. A profile preference, not a policy — RLS
    untouched. **Cost:** the dashboard layout now runs one extra query per
    request (`getHouseholdContext` alongside `getUiPreferences`).
  - **The assistant FAB left this screen**; the bottom nav's "+" is the only
    floating action on Transactions. `nav.aiAssistant` now points at
    `/dashboard/assistant` (shipped, previously unlisted) at phase `alpha`;
    `nav.movements` was deleted, the tab reads "Transactions".
  - **Not yet exercised against live data** (no Supabase credentials in the
    build environment — verified with Playwright on a disposable preview
    route, deleted before commit): the household switch, the period sheet
    over a payee-/tag-filtered URL, and long-press-to-select on a real touch
    device (the 8px threshold was tuned by eye).
- **The category moved to the top of the add-transaction form, and the form
  now fits one phone screen** (2026-09-15, PR #64). Ten commits, eight rounds
  of testing on a real Android device plus one review round. No migrations —
  `profiles.ui_preferences` already stores the new shape as jsonb.
  - **`quickEntry.fieldOrder`** (default `category_first`) puts the category
    directly under the amount; the old `account_first` order is one select
    away in Settings → Preferences → Quick entry. A single ordered chain
    (`ENTRY_CHAINS` + `nextInChain` in `transaction-form.tsx`) now drives
    "jump to the next empty field" from every entry point, including the
    category drill-down that used to skip it.
  - **Optional autofill from the last entry in the category**
    (`quickEntry.autofillFromLastInCategory`, off by default): picking a
    category seeds account, payee and tags from the household's most recent
    transaction in it, only into empty fields, names what it filled and
    offers Undo. New `src/lib/quick-entry/category-memory.ts`
    (`loadCategoryEntryMemory`), one query over the last 400 non-transfer
    transactions scoped by `household_id`, never run unless the preference is
    on. Recent descriptions are offered as chips, never filled. **Note:** the
    commits and code comments label this `BR-046` — that id already belongs
    to the currency-change confirmation shipped 2026-07-28
    (`docs/benchmark-review-mobile-money-managers.md` #17). Genuine id
    collision, not a renumbering; flagged in `docs/SPRINT-LOG.md`, not
    silently fixed.
  - **The four selectors are full-screen on mobile** with the search pinned
    under the header; `SelectorSheet` moved to `src/components/`,
    `tag-multi-select.tsx` gained a controlled mode, and
    `useIsMobile`/`useSoftKeyboardInset` are now shared hooks
    (`src/lib/use-is-mobile.ts`, `src/lib/use-soft-keyboard.ts`).
    `autoComplete="off"` on every search box and on payee/description stops
    Android's own saved-address autofill strip.
  - **Content dropped from 863px to 683px** (measured at 393px wide) with
    nothing hidden — `sr-only` title/subtitle on phone, one date row instead
    of two, no separate tag label. The dialog is a full `h-dvh` screen with
    its own close button; Cancel is gone wherever the dialog already has
    another way out (Escape/X/backdrop, plus Back in
    `TransactionDialogProvider` only — the assistant's review dialog has no
    Back handling and lost its Cancel, see `pending-work.md` §4.5); Create and
    Save-and-add-next
    are one split button on mobile; the action bar hides while the keyboard
    is open.
  - **Review round: four P2 defects fixed**, all the same shape — a value the
    autofill *guessed* was being treated as one the user *chose* (re-picking
    a category, switching transaction type, typing over a seeded field, and
    a tag created mid-tap).
  - **Not yet confirmed on a device:** the keyboard-open scroll fix and the
    four review-round fixes were reasoned from the code, not watched
    fail-then-pass. iPhone SE / 13 mini still overflow the one-screen target
    unless BR-032's Repeat/Notes/Status toggles are used.

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
  CategoryStylePicker, FormDialog, AmountInput, etc.). Reuse these; do not
  re-roll primitives.

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
