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
    another way out (Back/Escape/X/backdrop); Create and Save-and-add-next
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
- **The rename finished, and the Tier-3/4 QA gate got smaller** (2026-09-03 →
  09-04). Docs, skills and two new SQL invariant files. No app code, no
  migrations.
  - **The ten skills are `rumbo-*`.** Directories, `name:` frontmatter and
    every cross-reference in `.claude/`, `AGENTS.md`, the docs and the Stop
    hook. Skill identifiers were updated in the frozen records too — an
    identifier is a path, not a historical claim. The product name moved only
    in live docs; `docs/design/handoff-2026-06/`, the two benchmark reviews
    and past SPRINT-LOG entries keep "App Finanzas" because that is what was
    delivered and reviewed under that name. The Windows checkout path
    (`…\Projects\app-finanzas`) is a real directory and was left alone.
  - **A desk audit of `docs/alpha/tier-3-4-authenticated-qa.md` found a wrong
    row.** BR-035 claimed balances stay unchanged "until an individual
    instalment is actually posted". `create_installment_plan` inserts **all N
    instalments as `posted`** in the same call, each with its own entry and
    allocation. What BR-035 actually protects is that no parent transaction
    carries the total on top of them. Row rewritten.
  - **Four of the eleven rows now run under `npm run db:test`.** BR-040 and
    BR-039 were already covered by `br_040_refund_invariants.sql` and by
    `br_003_006`'s "transfers have no reporting allocations" — nobody had
    cross-linked them. Added `br_035_installment_invariants.sql` and
    `uc_009_recurring_transfer_invariants.sql`. UC-9's cross-currency refusal
    is app-layer, not a DB constraint, so only real data can prove it held.
  - **BR-044 needs no pass for the half people worried about**: `public.notes`
    has no amount column and no foreign key into the ledger, so "no financial
    side effect" is structural. Its RLS half needs a second household session.

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
  `app-scroll.ts` (**the** dashboard scroll container — `window.scrollY` does
  not work there; see `docs/features/mobile-app-shell.md`),
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
- Run checks before final answer (see the `rumbo-verify` skill):
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
