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

- **Transactions list — slim rows, premium polish** (2026-08-19, merged
  2026-08-20, branch
  `claude/transactions-premium-list`). UI only — no migration, no schema
  change, nothing written to the database. Every row in
  `src/app/dashboard/transactions/transaction-list.tsx` is now one slim line
  on every breakpoint, with badges, tags and actions behind its chevron;
  desktop used to render that block inline for all 4.633 rows. Each row leads
  with a tinted avatar (category emoji, else the direction arrow), and a leaf
  category inherits icon/colour from its nearest ancestor via
  `inheritCategoryVisual` in `page.tsx` — system categories carry icons and no
  colour (20260612180000), sub-categories carry neither. The row shows
  `categoryLeafName`; the full path is details-only. **The column layout is a
  `@container` query, not `lg:`** — with a sidebar a 1024px viewport leaves the
  card ~740px, so viewport breakpoints switched to columns exactly where they
  stopped fitting. Note for anyone adding one: Tailwind v4 wants
  `@min-[60rem]:`, and the v3 form `@[60rem]:` compiles to **nothing** without
  erroring. Column widths are fixed so amounts line up across rows; checkboxes
  appear on hover (or via "Select" on touch); review state is a dot, not a
  badge; only inflows are tinted; an untitled row falls back to payee, then
  category. The time of day left the row (the create form cannot record one)
  and survives in the details panel. Also fixes the `Stop` verify-gate hook,
  which spawned `npx.cmd` via `execFileSync` — `EINVAL` with no output on
  Node ≥18.20, so the gate failed every turn on Windows.

- **Development automation, second wave — context budget** (2026-08-19, branch
  `claude/token-optimization`). Tooling only — no migration, no schema change,
  nothing in `src/`. Attacks token cost the way the first wave attacked
  correctness. `AGENTS.md` went 42.333 → ~9.500 bytes: its `Current status`
  held 22 sprint entries already duplicated in `docs/SPRINT-LOG.md`, so only
  the two newest stay here and the log grew 24 → 26 entries (two entries lived
  *only* in `AGENTS.md` and were migrated before deleting). Four subagents now
  isolate the context-heavy jobs: `scout` (locates code, returns `file:line`
  instead of dumping 2.000-line files), `i18n-scribe` (`src/lib/i18n/`, ~4.100
  lines), `migration-drafter` (`supabase/migrations/`, 626 KB — writes the
  `.sql`, never touches the DB) and `sprint-closer` (rotates this very list).
  Commands `/buscar`, `/contexto`, `/i18n`, `/cerrar-sprint`. New `PreToolUse`
  hook `context-guard.mjs` exits 2 on generated artifacts (`.next`, lockfile,
  `*.tsbuildinfo`) and on whole reads of files over 700 lines, via `Read` *and*
  via `cat`/`type`/`Get-Content`; partial reads pass, `AGENTS.md`/`CLAUDE.md`
  are exempt, and the denial message lists the cheaper alternatives. The
  Supabase MCP server is now `disabledMcpjsonServers` — enable with `/mcp` when
  you actually need the DB. See
  [docs/ai-agents-workflow.md](./docs/ai-agents-workflow.md) §Ola 2.

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
reported 58/58 on 2026-08-12, the day Tier-3 and Tier-4 were merged and
pushed. Nothing is pending.

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
