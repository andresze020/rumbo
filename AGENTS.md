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

- **Modal overlays, dashboard legibility, and a cheaper assistant**
  (2026-08-22, branch `fix/mobile-ui-zoom-overlays-and-activity`). Closes the
  P4/P3 mobile-UI gaps the viewport-pinning sprint (2026-08-21) deliberately
  deferred, ships the text-size setting that sprint also scoped out, and
  clears three more P3 rows from `docs/pending-work.md` §3 picked up in the
  same branch. No migrations in any of it.
  - **Overlays pinned to the visual viewport.** New `.vv-pin-screen`,
    `.vv-pin-screen-center` and `.vv-pin-screen-edge` utilities in
    `globals.css`, fed by new `--vv-width`/`--vv-height` on `ViewportPin`.
    Unlike the chrome, an overlay is content — a zoom should magnify a
    dialog, not shrink it back to size — so these are **not** counter-scaled
    and get no transform or wrapper of their own, since every dialog, sheet
    and drawer already owns one. Applied to `dialog`, `alert-dialog`,
    `sheet`, `drawer`, `selector-sheet.tsx`, and the transactions filter
    sheet, which shadows the pin variables off at `sm:` since it is a static
    toolbar there, not a sheet.
  - **Dashboard legibility.** Recent Activity's amount column is `auto`
    instead of a fixed 88px — a six-figure COP amount didn't fit, and
    truncating money is never right; the title wraps to two lines on phone;
    the date is `shrink-0` on the secondary line so it survives instead of
    losing to the subtitle. The assistant FAB now fades (opacity only —
    `vv-pin-corner` already owns its transform) while the page scrolls down
    and returns on scroll-up or a 1.2s pause. Not hidden on phone: it's the
    only entry point to the assistant there.
  - **In-app text size.** Settings gains `default`/`large`/`larger`, stored
    in the existing `profiles.ui_preferences` jsonb (no migration), applied
    as a `%` root `font-size` by new `TextSizeSync` — mounted in the
    dashboard layout, not the root layout, so `/login` never pays for a
    profile read to learn a preference it can't have. `%` and not `px` so a
    reader's own browser zoom stacks instead of getting overridden. Also
    fixed a real `audit-i18n.mjs` gap: it misses object values reached by
    computed index, so `<select>` option labels (`PERIOD_LABELS` included)
    were shipping untranslated despite a green i18n check.
  - **CI on pull requests.** New `.github/workflows/ci.yml` — lint →
    `tsc --noEmit` → `i18n:check` → build — since no `.github/` existed and
    PRs merged with zero automated validation.
  - **`npm run db:test`.** The three `supabase/tests/*.sql` ledger-invariant
    files are runnable for the first time (`scripts/db-test.mjs` + shared
    `scripts/lib/supabase-api.mjs`, also used by `db-push.mjs` now). Nothing
    it runs writes, except `br_019`'s self-rolling-back transaction, which is
    sent as one request on purpose so it can never half-commit into
    production. Also fixed a latent Windows crash in `db-push`
    (`process.exit()` with an open fetch socket died with `0xC0000409`
    instead of exit code 1).
  - **Assistant moved to Claude Haiku 4.5**, Anthropic's cheapest tier ($1/$5
    per million tokens in/out vs Sonnet 5's $3/$15). Verified against the
    Models API rather than assumed: `image_input` still works (receipts are
    fine), but this tier has a 64K output cap and **no `output_config.effort`
    — sending it is an outright error**, and neither call site sends one.
    `max_tokens` also rose from 1024 (16000 for the assistant loop, 4096 for
    receipt-draft extraction), which was silently truncating long replies
    mid-sentence.
  - **QA checklist scaffolding**: `docs/alpha/tier-3-4-authenticated-qa.md`,
    eleven rows (the ten Tier-3/4 features plus BR-031, missing from the
    original list despite shipping in Tier-3), all still `Untested` — the
    doc exists, the pass has not been run.
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

All migrations are applied. `npx supabase migration list --linked`
reported 59/59 on 2026-08-21 (58/58 on 2026-08-12, the day Tier-3 and
Tier-4 were merged and pushed, plus `20260817120000_balance_fx_revaluation.sql`
confirmed applied since). Nothing is pending.

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
- From a cloud session `npx supabase db push` cannot work at all: it needs TCP
  5432, and cloud egress is HTTP/HTTPS only. Use `npm run db:status` /
  `node scripts/db-push.mjs push --apply`, which applies the same migrations over
  the Management API. See `docs/db-push-over-https.md`. Same rule as above — only
  when the user asks.
