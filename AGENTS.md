# AGENTS.md — App Finanzas

> Canonical project-state document. Keep this in sync at every sprint close
> (see the `app-finanzas-state-sync` skill). If this file and the code disagree,
> the code wins — and this file is the bug.

## Project context

This is App Finanzas, a personal/family finance PWA.

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

- **Chrome pinned to the visual viewport** (2026-08-21, branch
  `claude/zoom-scroll-header-footer-53n6iv`). UI only, no migration. A fast
  scroll on a phone occasionally picks up a stray second finger and pinch-zooms
  the page a few percent. `position: fixed` anchors to the *layout* viewport,
  which is then larger than the screen, so the mobile header and the bottom tab
  bar hung off its edges and read as cut off — you lost one or the other
  depending on where the visual viewport had been panned to. `ViewportPin`
  (`src/components/viewport-pin.tsx`, mounted in the root layout) publishes the
  visual viewport's geometry as CSS variables while the scale deviates from 1,
  and the `.vv-pin-*` utilities in `globals.css` translate the chrome onto it
  and counter-scale it by `1/scale`, so the bars keep their on-screen size at
  the screen edges and the zoom magnifies only the content. All of it is scoped
  to `[data-vv-zoomed]`: at rest there is no transform, and therefore no
  containing block for anything `fixed` rendered inside the bars. **Pinch zoom
  stays enabled on purpose** — see `docs/pending-work.md` §2 before disabling
  it.
- **Exchange rates refresh themselves** (2026-08-21, branch
  `claude/andromoney-import-script-6u4fy1`). No migration — the
  `exchange_rates` table and the FX revaluation below already existed; what was
  missing was anyone filling the table. `refreshExchangeRatesAction`
  (`src/app/dashboard/exchange-rate-actions.ts`) tops up any rate not dated
  today from the same public feed the four entry forms have used all along
  (`@fawazahmed0/currency-api` on jsDelivr — no key, and it carries COP, which
  the ECB-backed feeds do not). `ExchangeRateAutoRefresh`, mounted in the
  dashboard layout, fires it on the first render of a browser session and
  records the day in `sessionStorage`, so navigating does not re-hit the
  provider. It runs **as the signed-in user** — RLS applies as everywhere else,
  no service-role key and no cron were introduced. New `fetchDirectRate` in
  `src/lib/fx.ts` reads the pair in the direction the ledger stores it
  (`1 from = N to`, the inverse of what the forms ask for) and falls back to
  reading the other currency's file and inverting. Rates are dated as the
  provider published them, not "today", so a weekend does not invent a
  quotation. A provider outage is a no-op: the previous rate stays and balances
  keep using it. Settings gains an **Update now** button and shows whether each
  rate is `auto` or `manual`.
- **Balance FX revaluation** (2026-08-20, branch
  `claude/andromoney-import-script-6u4fy1`). Migration
  `20260817120000_balance_fx_revaluation.sql` — **not applied yet**. A
  foreign-currency account's base-currency balance was
  `sum(transaction_entries.amount_base_currency)`, every movement frozen at the
  rate it was booked at: a **cost basis** that drifts from reality without
  limit. A COP account holding 29.262.996 COP read as ≈ 9.647 CAD (four years of
  blended history) on a morning those pesos were worth ≈ 13.278 CAD. Both
  `get_account_balances` overloads now revalue: a **stock** (a balance at a
  point in time) converts at the rate in effect on that date, while a **flow**
  (income, an expense, a budget line) keeps the rate of its own transaction
  date, so `transaction_allocations` and every report and budget built on it are
  untouched. Rates come from the BR-002 `exchange_rates` table, which was built
  for exactly this and until now had no reader; new
  `get_exchange_rate_as_of(...)` returns the rate **and its date**, and
  `get_exchange_rate` keeps its signature and contract as a thin wrapper over
  it. **Falls back to the historical sum** when no rate is on file, so a
  household that never enters one sees no change. New
  `base_conversion_rate`/`base_conversion_rate_date` columns let the UI tell the
  two apart; the accounts screen names the currencies that fell back, and
  Settings → Exchange rates is the editor (both rate directions, mirrored).
  The one-off AndroMoney history importer (`scripts/andromoney-*.mjs`, merged
  earlier) is what surfaced this. See
  [docs/features/exchange-rates.md](./docs/features/exchange-rates.md) and
  [docs/features/andromoney-import.md](./docs/features/andromoney-import.md).

> **Historia anterior:** las entradas de sprint previas viven en
> `docs/SPRINT-LOG.md` (append-only, más reciente arriba). No se resumen aquí:
> leerlas en cada sesión costaba ~9k tokens que casi nunca se usaban. Consulta
> el log solo cuando necesites el porqué de una decisión pasada.

- See `docs/alpha/sprint-12-alpha-plan.md` for the live Alpha plan,
  `docs/alpha-readiness-checklist.md` for the readiness gate, and
  `docs/pending-work.md` for a single index of every open feature, BR
  backlog item, and cross-feature Open Decision.
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

`supabase/migrations/` holds 59 files. `npx supabase migration list --linked`
reported 58/58 applied on 2026-08-12, the day Tier-3 and Tier-4 were merged and
pushed. The 59th — `20260817120000_balance_fx_revaluation.sql` — is recorded as
**still pending** by both Current status above and `docs/SPRINT-LOG.md`; no one
has re-run the list since, so confirm with `npx supabase migration list
--linked` before assuming either way. Nothing else is outstanding.

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
  `use-back-dismiss.ts` (overlay Back handling),
  `analysis/server.ts` + `analysis/report-query.ts` (shared data helpers for the
  analysis screens; Reports and Calendar read the same rows),
  `cards/cycle.ts` (BR-030 statement-cycle dates), `installments/shared.ts`
  (BR-035 split + dates), `periods/month.ts` (BR-036 — **the** period resolver;
  do not re-derive period boundaries anywhere else).
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
- Run checks before final answer (see the `app-finanzas-verify` skill):
  - `npm run lint`
  - `npx tsc --noEmit`  (there is no `typecheck` npm script)
  - `npm run build` when feasible
- The typecheck above is also enforced by a `Stop` hook, so a turn that leaves
  broken types cannot be closed. Subagents, slash commands and hooks are
  documented in `docs/ai-agents-workflow.md`.
- The `zoho-*` skills visible in some sessions belong to a different project.
  Never use them here.

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
