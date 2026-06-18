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

- **Goals & funds (BR-019)** shipped. New `goals` table
  (`20260618000100_create_goals.sql`, **not yet applied** — run
  `npx supabase db push`) with type/status check constraints, member-select +
  admin-write RLS, and no delete policy (soft-archive only, per the
  archive-over-delete rule). `/dashboard/goals` has full CRUD plus
  contribute/withdraw (auto-completes when `current_amount >= target_amount`)
  and pause/resume/archive/restore lifecycle actions
  (`dashboard/goals/{page,actions,goal-card,goal-form,goal-progress-form}.tsx`,
  `lib/goals/shared.ts`). The nav entry moved from `phase: 'beta'` (locked
  coming-soon page) to `phase: 'alpha'`. Dashboard's goals-mini widget and the
  Plan page's Goals card now read real data instead of the mock/locked
  placeholders.
- **UI redesign — Sprint 4: Transactions inline/bulk edit + review workflow**
  (2026-06-15). `/dashboard/transactions` now supports inline per-row
  quick-edit (merchant, category, amount) via `updateManualTransactionAction`,
  row selection with a sticky bulk action bar (mark reviewed via new
  `updateReviewStatusAction`, bulk recategorize via new
  `bulkCategorizeAction`), and review-status badges/filter chips (To review /
  Reviewed / Flagged). Date-grouped list (Today/Yesterday) and existing
  filters/CSV-import/transfer/void flows are unchanged. New component:
  `transaction-list.tsx`. The filter bar was redesigned into an
  always-visible toolbar: type segmented control, search, multi-select
  Account/Category chips, Status chip, date-range presets + From/To inputs,
  and a mobile "Filters" collapse. Backed by an additive migration
  `20260614120000_sprint_4_transaction_review_status.sql` (adds
  `transactions.review_status`, **not yet applied** — run
  `npx supabase db push`). Sprints 1–3 of this redesign (sidebar nav, mobile
  bottom nav, dashboard) are already merged; see `docs/SPRINT-LOG.md`.
- **UI redesign — Sprint 3: Dashboard "Centro de control"** (2026-06-14).
  `/dashboard` was rebuilt to match `docs/design/handoff-2026-06`: a net-worth
  hero (real assets/liabilities/projected + 6-month sparkline + a clearly-marked
  DEMO month-health score), monthly metric cards with vs-prev-month deltas,
  budget-vs-actual bars, a category donut whose legend rows link to
  `/dashboard/transactions` filtered by category+month, upcoming recurring
  payments, a right rail (live insights, debts mini, Beta goals-mini teaser), and
  a recent-activity feed. The standalone Accounts summary card was removed from
  the dashboard (still available at `/dashboard/accounts`). New components:
  `category-donut`, `financial-hero-card`, `insight-card`, `recent-activity`.
  Sprints 1–2 of this redesign (sidebar nav, mobile bottom nav) are already
  merged; see `docs/SPRINT-LOG.md`.
- Phase: **MVP Alpha — personal/family real-data usage (Sprint 12.x)**.
- The MVP is feature-complete for personal use. Sprint 12 deliberately delays
  post-MVP work until real Alpha usage proves what is actually missing or broken.
- Recent sprints (12.4–12.7+) addressed alpha findings and UX friction:
  date-grouped transaction list, toast feedback, smart form defaults, month
  navigation, loading skeletons, PWA install hint, ES/EN localization foundation,
  and the `FormDialog` migration for all create/edit/action forms.
- `AmountInput` (PR #8): shared component + `formatAmountForDisplay`/
  `sanitizeAmountInput`/`getCurrencySymbol` helpers in `lib/format.ts`. Adopted in
  budget line, debt, opening balance, and transaction/transfer edit forms, and the
  AI assistant draft card now renders extracted amounts as currency.
- Wealthsimple-style account **List/Group(by type) view toggle** across
  accounts, dashboard, and net-worth (cookie `af_accounts_view`, default group),
  plus **drag-and-drop reordering** on the accounts page via `@dnd-kit` (writes
  `accounts.sort_order`). Balances now use the shared `BalanceAmount` component
  (green positive / red negative + minus sign — color-blind-aware). New code:
  `lib/accounts-view/*`, `components/{accounts-view-toggle,account-group,balance-amount}`,
  `accounts/sortable-accounts-list`.
- **Categories drag-and-drop + style picker**. Siblings-only reorder
  (roots within a type, children within a parent) via `@dnd-kit` +
  `reorderCategoriesAction` (`categories/sortable-category-list.tsx`,
  `CategoryRow` gained an optional `dragHandle`). New `CategoryStylePicker`
  (color swatches + finance-emoji grid, with a custom hex/emoji escape hatch)
  replaces the old free-text color/icon inputs. System default categories now
  seed with a fitting **icon only** (no default color — kept clean) via
  `create_default_categories_for_household`; category icons also show in every
  category dropdown (transaction picker, category form parent selector,
  transaction filters, budget line selector). New code:
  `lib/categories/style.ts`, `components/category-style-picker`,
  `categories/sortable-category-list`.
- Latest: **BR-003..BR-006 net-worth correctness + verification**. Net Worth now
  documents its stored-historical-rate FX policy in the UI, as-of balances exclude
  archived accounts, the React hooks lint gate is clean, and
  `supabase/tests/br_003_006_money_invariants.sql` provides first lightweight SQL
  money-invariant checks. See `docs/features/net-worth-fx-policy.md` and
  `docs/features/financial-correctness-checks.md`.
- **BR-001 CSV import FX correctness / BR-002 FX rate foundation** shipped earlier
  in Sprint 12.x. CSV imports resolve per-row FX instead of defaulting to 1:1.
  New `exchange_rates` table plus `get_exchange_rate(...)` support same-currency
  `1`, latest-prior lookup, and inverse-pair fallback. See
  `docs/features/csv-import-fx.md`.
- **Recurring transactions — manual posting MVP (Sprint A)** shipped earlier in
  Sprint 12.x. `/dashboard/recurring` has Due/Upcoming/Inactive sections,
  income/expense template CRUD, lifecycle (activate/deactivate/delete), and
  one-click **Post**. **Auto-posting (Sprint B) and the dashboard widget +
  recurring transfers (Sprint C) are still pending** — see
  `docs/features/recurring-transactions.md`.
- See `docs/alpha/sprint-12-alpha-plan.md` for the live Alpha plan and
  `docs/alpha-readiness-checklist.md` for the readiness gate.

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
- import_batches
- import_rows

Migrations live in `supabase/migrations/` (timestamped `YYYYMMDDHHmmss_*.sql`).

## Key areas of the app

- `src/app/dashboard/` — accounts, categories, transactions, budgets, debts,
  net-worth, recurring, goals, export, settings, assistant (AI).
- `src/lib/supabase/{client,server,middleware}.ts` + `src/middleware.ts` — auth/SSR.
- `src/lib/` — `format.ts`, `fx.ts`, `account-display.ts`, `recurring/`, `imports/`, `exports/`.
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

## Git rules

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
