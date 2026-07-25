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

- **Full UI localization + persisted language preference** (2026-07-25).
  All authenticated views and shared UI have English, Spanish, and Canadian
  French coverage, including dynamic dialogs, loading states, accessible
  labels, dates, and system-category names. `profiles.locale` is canonical;
  `af_locale` is restored from it during password and OAuth login. Coverage is
  guarded by `npm run i18n:check` (1,036 visible phrases × 2 translated locales).
- **Hard-backlog integration — PR #37** (2026-07-25, merged to `main`).
  BR-007 cross-currency transfers, BR-008 transaction pagination/server
  filters, BR-010 categorization rules, BR-014 recurring auto-post, Reports
  filters, and transfer-cost UX are integrated. Their production migrations,
  the `pg_cron` extension, `run_recurring_autopost()` function, and daily
  `recurring-autopost` job are operational. Authenticated real-data QA remains
  a manual release gate; see `docs/pending-work.md`.
- **Closure + small improvements sprint** (2026-07-25, merged locally). Settings
  includes profile, email change/confirmation state, password, household,
  theme, language, and global sign-out. Recurring shows an aggregate auto-post
  health alert. BR-025 now centralizes locale-aware daily date formatting in
  `lib/format.ts`. Payees bulk merge is implemented with additive migration
  `20260725120000_payees_bulk_merge.sql` (pending `db push`).
- **Tags — BR-023** and **CSV import presets + revert — BR-024** are merged and
  their migrations are applied. BR-023
  adds a free-form tagging layer orthogonal to categories (many-to-many):
  `tags` + `transaction_tags` junction, a `/dashboard/tags` CRUD page (Money
  nav group), a `TagMultiSelect` wired into the add + edit forms (tags are
  set via a separate `set_transaction_tags` RPC after the transaction RPC, so
  no new overloads), tag chips on transaction rows, and an all-time `tag_id`
  filter. BR-024 adds saved column-mapping presets (`csv_import_presets`) and
  a confirm-gated import **revert** (`revert_csv_import` soft-deletes a
  batch's transactions and marks the batch `reverted`).
- **Transaction form — mobile redesign** (2026-07-21, PR #33 + merges of
  `feat/transaction-form-mobile-rows` / `fix/transaction-form-dense-mobile` /
  `fix/transaction-form-single-screen`). The add/edit form now uses an
  AndroMoney-style compact **row list** on phones (each field a tap-to-expand
  row) and a two-column grid on desktop; account/category/payee open a
  full-screen `SelectorSheet` on mobile and a floating popover combobox on
  desktop, both with inline search + create. Single-screen layout, denser
  spacing, one-tap payee list, and category drill-down into subcategories.
- **Tier-1 easy wins** (2026-07-20, merged `3517c4b`). BR-025 focused locale
  formatting (`localeToBcp47`, threaded locale through dashboard/plan/budgets/
  transactions; deduped `formatPercent`), BR-028 PWA `share_target`, BR-015
  void **Undo** (`unvoid_transaction` RPC) + generalized archive+undo to goals
  and recurring templates, and BR-009 residuals (CSV import + recurring
  templates now carry a payee; migration `20260720130000` adds
  `recurring_transactions.payee_id`).
- **Payees maintenance — BR-009 slice 2** (2026-07-20, PR on
  `feat/br-009-payee-crud`). BR-009 is now fully closed. New
  `/dashboard/payees` CRUD page (Money nav group): list with usage stats
  (transaction count + last-used via `get_payees_with_stats`), create,
  rename (propagates to linked `transactions.merchant_name`),
  archive/restore, and **merge** duplicates (`merge_payees` RPC reassigns
  transactions to the surviving payee, then archives the drained source).
  Migration `20260717120000_br_009_payee_crud.sql` adds `payees.is_archived`
  + the two RPCs. Also: the transaction form's payee field is now a
  searchable combobox built on **Base UI Autocomplete** (floating portal,
  no dialog clipping; used by add/edit forms and the inline quick-edit);
  the transactions list takes a `payee_id` filter (all-time by default,
  dismissible chip) reachable from each payee's "View transactions" button;
  and the field is labeled **Payer** on income vs **Payee** on expense
  (`transactionForm.payer`, en/es/fr). Slice 1 (the payee picker wired to
  write `payee_id`) shipped earlier in the Tier-2 cluster.
- **Sprint 13 — Quick wins** (2026-06-23). Closed BR-026 (renamed
  `src/middleware.ts` → `src/proxy.ts` and the exported function to `proxy`,
  per Next 16's middleware→proxy convention; build no longer warns), BR-027
  (removed 5 dead root-level redirect stubs — `/budgets`, `/debts`,
  `/export`, `/net-worth`, `/transactions/import` — that only redirected to
  their real `/dashboard/...` pages), and BR-012 (dashboard "N to review"
  pill next to Recent Activity, linking to `/dashboard/transactions`
  pre-filtered to `review_status = 'unreviewed'`; QA on a real-data demo
  household caught that the link silently inherited the transactions page's
  current-month default, hiding older unreviewed rows — fixed with an
  explicit wide date range on the link; the underlying gap, no "All time"
  filter preset, is tracked as new **BR-029**). Partial progress on BR-015
  (new reusable `AlertDialog` in `components/ui/alert-dialog.tsx`, adopted
  for the void-transaction confirm; no archive action exists yet to
  standardize, no undo/toast) and BR-009 (new `payees` table + backfill from
  distinct `merchant_name` per household via
  `20260622100000_create_payees.sql`, **applied** — this was the data-model
  slice only; the picker and the `/dashboard/payees` CRUD shipped later, see
  the Payees entry above). Also
  added a dev/demo-only maintenance function,
  `public.copy_household_data(source, target, actor)`
  (`20260622110000_copy_household_data.sql`, **applied**) — wipes the target
  household and mirrors the full dataset (12 tables) from a source
  household, for seeding realistic demo data; intentionally not granted to
  `authenticated`, run manually from the Supabase SQL editor. See
  `docs/alpha/benchmark-follow-up-issues.md` and `docs/SPRINT-LOG.md` for
  detail.
- **Goals & funds (BR-019)** shipped and merged (PR #13). `goals` table
  (`20260618000100_create_goals.sql`, **applied** to the linked remote
  project) with type/status check constraints (`target_amount > 0`),
  member-select + **editor**-write RLS (`is_household_editor`, matching
  `transactions`/`budgets`), `linked_account_id` `on delete set null` with a
  supporting index, and no delete policy (soft-archive only, per the
  archive-over-delete rule). `/dashboard/goals` has full CRUD plus
  contribute/withdraw (auto-completes when `current_amount >= target_amount`)
  and pause/resume/archive/restore lifecycle actions
  (`dashboard/goals/{page,actions,goal-card,goal-form,goal-progress-form}.tsx`,
  `lib/goals/shared.ts`). Contribute/withdraw go through an
  `apply_goal_adjustment` RPC that row-locks the goal so concurrent
  adjustments can't clobber each other (a follow-up fix — the first version
  did a plain select + JS math + update). The nav entry moved from
  `phase: 'beta'` (locked coming-soon page) to `phase: 'alpha'`. Dashboard's
  goals-mini widget (keyed by `id`, not `name`) and the Plan page's Goals
  card (now includes `active`/`paused`/`completed` goals in "Total saved",
  not just `active`) read real data instead of the mock/locked placeholders.
  `StatusBadge` has explicit styles for `paused`/`completed`/`archived`. See
  `docs/features/goals.md` (including an Open Decisions note on whether a
  linked goal should eventually derive its progress from the account's real
  ledger balance instead of the manually-tracked `current_amount`) and
  `supabase/tests/br_019_goals_invariants.sql`.
- **Analysis & planning screens (PR #12, 2026-06-16)** shipped: `/dashboard/reports`,
  `/dashboard/trends`, `/dashboard/cash-flow`, `/dashboard/month-review`, and
  `/dashboard/debt-planner` turned from locked coming-soon placeholders into
  real pages driven by existing ledger data (no new migrations). Reports has
  category/merchant tabs, a distribution donut, and a ranked list; Trends has
  multi-month income/expense/savings/net-worth/savings-rate charts; Cash flow
  has inflow/outflow bars with a net line; Month review has vs-prev-month
  deltas, budget performance, and suggested actions (its health grade is an
  explicitly-labeled **mock/demo heuristic**, same one used on the dashboard,
  and its "Close month" button is disabled/not-yet-built); Debt planner
  compares avalanche/snowball payoff strategies with an extra-payment
  recalculation. Shared: `src/lib/analysis/server.ts`, `src/components/analysis/charts.tsx`.
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
  `transactions.review_status`, **applied**). Sprints 1–3 of this redesign
  (sidebar nav, mobile bottom nav, dashboard) are already merged; see
  `docs/SPRINT-LOG.md`.
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
- **Recurring transactions — Sprint A + Sprint B** are operational.
  `/dashboard/recurring` has template CRUD, manual posting, the dashboard due
  widget, opt-in auto-posting, per-template errors, run logging, and an
  aggregate health alert. Only recurring transfers (UC-9) remain deferred;
  see `docs/features/recurring-transactions.md`.
- See `docs/alpha/sprint-12-alpha-plan.md` for the live Alpha plan,
  `docs/alpha-readiness-checklist.md` for the readiness gate, and
  `docs/pending-work.md` for a single index of every open feature, BR
  backlog item, and cross-feature Open Decision.

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

Pending migration prepared locally: `20260725120000_payees_bulk_merge.sql`
(adds the `merge_payees_bulk` function; no new table).

Migrations live in `supabase/migrations/` (timestamped `YYYYMMDDHHmmss_*.sql`).

## Key areas of the app

- `src/app/dashboard/` — accounts, categories, payees, transactions, budgets,
  debts, net-worth, recurring, goals, export, settings, assistant (AI), plus the
  analysis/planning screens: reports, trends, cash-flow, month-review,
  debt-planner.
- `src/lib/supabase/{client,server,middleware}.ts` + `src/proxy.ts` — auth/SSR
  (renamed from `src/middleware.ts` in Sprint 13, per Next 16 convention).
- `src/lib/` — `format.ts`, `fx.ts`, `account-display.ts`, `recurring/`, `imports/`,
  `exports/`, `analysis/server.ts` (shared data helpers for the analysis screens).
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
