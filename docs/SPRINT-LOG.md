# Sprint Log — App Finanzas

Append-only record of closed sprints. One entry per sprint, newest at the top.
Maintained at sprint close by the `app-finanzas-state-sync` skill.

History before this log (Sprints 2.x–12.x) lives in `docs/alpha/` and
`docs/alpha-readiness-checklist.md`. Start logging here going forward.

<!-- Template:
## Sprint <X.Y> — <short name>  (<YYYY-MM-DD>)
- Goal:
- Shipped:
- Migrations added:
- Tables changed:
- Follow-ups / known gaps:
-->

## Sprint — Goals & funds (BR-019) (2026-06-18)
- Goal: implement the only nav item still locked behind `phase: 'beta'`
  (Goals & funds) per BR-019 in
  `docs/alpha/benchmark-follow-up-issues.md` — the `goals` table was fully
  designed in the initial schema doc but never migrated, and the page was a
  locked coming-soon placeholder.
- Shipped: `/dashboard/goals` with full CRUD (`GoalForm`), contribute/withdraw
  actions (`GoalProgressForm`, single form-action-per-mode, no per-button
  `formAction` — no precedent for that pattern in this codebase) that
  auto-flip status to `completed` when `current_amount >= target_amount`,
  and pause/resume/archive/restore lifecycle via `setGoalStatusAction`.
  Goals are grouped into Active/Completed/Paused/Archived sections
  (`goal-card.tsx`), with summary `MetricCard`s (active count, completed
  count, total saved vs. target for base-currency goals). New shared helpers
  in `lib/goals/shared.ts` (goal types, statuses, progress/reached
  calculations). Nav entry flipped from `phase: 'beta'` to `phase: 'alpha'`
  (`lib/nav/config.ts`). Dashboard's goals-mini widget and the Plan page's
  Goals card now read real `goals` rows instead of mock data / a locked card.
  Hardcoded English UI for the new page, matching the dominant pattern in
  `recurring`/`debts` (most feature pages don't use the i18n `translate()`
  system); touched only the few i18n keys already used by shared chrome
  (dashboard widget, plan page, nav label) across en/es/fr.
- Migrations added: `20260618000100_create_goals.sql` (additive — new
  `goals` table: name, goal_type, target_amount, current_amount,
  currency_code, target_date, linked_account_id, status, with type/status
  check constraints, a household+status index, member-select RLS, and
  admin-only insert/update RLS; deliberately no delete policy since goals
  use soft `archived` status instead of physical deletion). **Not yet
  applied** — run `npx supabase db push`.
- Tables changed: new `goals` table.
- Follow-ups / known gaps: no automation (e.g. recurring auto-contributions)
  — manual contribute/withdraw only, matching MVP scope. No i18n for the new
  page itself (English-hardcoded, consistent with `recurring`/`debts`).

## Sprint 4 — Transactions redesign: inline/bulk edit + review workflow (2026-06-15)
- Goal: rebuild `/dashboard/transactions` per
  `docs/design/handoff-2026-06/prompts/sprint-4-transactions.md` — inline
  quick-edit, bulk actions, and a review-status workflow, as part of the
  multi-sprint UI redesign (Sprints 1–3 covered nav, mobile bottom nav, and
  the dashboard).
- Shipped: inline per-row quick-edit (merchant, category, amount) reusing
  `updateManualTransactionAction`; row selection with a sticky bulk action
  bar (mark reviewed via new `updateReviewStatusAction`, bulk recategorize
  via new `bulkCategorizeAction`); review-status badges and filter chips
  (To review / Reviewed / Flagged); kept date-grouped list (Today/Yesterday)
  and existing filters/CSV-import/transfer/void flows unchanged. New
  component: `transaction-list.tsx`. Filter bar redesigned into an
  always-visible toolbar: type segmented control (All/Income/Expense/
  Transfer), search, multi-select Account/Category chips, Status chip,
  date-range presets plus From/To inputs, and a mobile "Filters" collapse
  toggle.
- Migrations added: `20260614120000_sprint_4_transaction_review_status.sql`
  (additive — adds `transactions.review_status` text column, default
  `'unreviewed'`, check constraint `unreviewed|reviewed|flagged`, and a
  `(household_id, review_status)` index).
- Tables changed: `transactions` (new `review_status` column + index).
- Follow-ups / known gaps: migration not yet applied — review badges/chips
  will not reflect real data until `npx supabase db push` is run. No i18n
  yet for the new Sprint 4 labels (page remains English-hardcoded).

## Sprint 3 — Dashboard redesign: Financial Control Center (2026-06-14)
- Goal: rebuild `/dashboard` to match the `docs/design/handoff-2026-06` mockups
  (desktop "Centro de control" + mobile views), as part of the multi-sprint UI
  redesign (Sprints 1–2 covered sidebar nav and the mobile bottom nav).
- Shipped: net-worth hero with real assets/liabilities/projected balances, a
  6-month sparkline, and a month-health score clearly marked as a DEMO; four
  monthly metric cards with vs-previous-month deltas; budget-vs-actual bars;
  a pure-SVG category donut whose legend rows link to `/dashboard/transactions`
  filtered by category + month; an upcoming-recurring-payments list with
  Due/Scheduled/Auto tags; a right rail with live insights, a debts mini summary,
  and a Beta goals-mini teaser; and a recent-activity feed (transaction
  description as the title, "category · merchant" subtitle, fixed-width columns
  for row alignment). Removed the standalone Accounts summary card from the
  dashboard (account management remains at `/dashboard/accounts`). New
  components: `category-donut.tsx`, `financial-hero-card.tsx`,
  `insight-card.tsx`, `recent-activity.tsx`.
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps: the month-health score is a MOCK/DEMO heuristic
  (clearly labeled, not financial advice); "Metas y fondos" shows a hardcoded
  illustrative teaser because Goals has no backend yet, and links to the locked
  `/dashboard/coming-soon/goals` page.

## Sprint 12.x — BR-003..BR-006 net-worth correctness + verification (2026-06-14)
- Goal: make Net Worth's FX policy explicit, prevent archived accounts from
  distorting historical/as-of net-worth totals, clear the lint gate, and add a
  first repeatable money-invariant check file.
- Shipped: Net Worth now shows an FX policy callout explaining that stored
  historical ledger rates are used and month-end revaluation is not implemented
  yet; `get_account_balances(p_household_id, p_as_of_date)` now filters archived
  accounts; React hooks lint failures were removed without intended behavior
  changes; `supabase/tests/br_003_006_money_invariants.sql` documents read-only
  SQL checks for FX, archived-account, transfer, voided, and allocation-based
  reporting invariants. New docs:
  `docs/features/net-worth-fx-policy.md`,
  `docs/features/react-hooks-lint-cleanup.md`, and
  `docs/features/financial-correctness-checks.md`.
- Migrations added:
  `20260614000100_br_004_exclude_archived_as_of_balances.sql`.
- Tables changed: none.
- Follow-ups / known gaps: no market-rate net-worth revaluation yet; SQL checks
  remain manual until the project adopts a real automated test runner. Manual
  Supabase apply still required: `npx supabase db push`.

## Sprint 12.x — BR-001/BR-002 CSV import FX + rate foundation (2026-06-13)
- Goal: stop CSV imports from silently converting non-base account rows at a
  hard-coded 1:1 rate, and add the shared FX rate foundation needed by
  cross-currency flows.
- Shipped: household-scoped `exchange_rates` table; `get_exchange_rate(...)`
  lookup RPC with same-currency `1`, latest-prior direct-pair lookup, and inverse
  pair fallback; replacement `create_csv_import(...)` that resolves per-row FX
  from account currency to household base currency and logs rows without a usable
  rate as invalid instead of creating incorrect ledger entries. The import screen
  now warns when non-base accounts require saved rates, and
  `docs/features/csv-import-fx.md` plus `docs/features/exchange-rates.md`
  document the contracts.
- Migrations added: `20260613000100_br_001_csv_import_fx.sql`.
- Tables changed: **new table** `exchange_rates`.
- Follow-ups / known gaps: no rate-management UI yet; rates must be seeded
  manually or by a future fetch/persist workflow. Manual Supabase apply still
  required: `npx supabase db push`.

## Sprint 12.x — Recurring transactions: manual posting MVP (2026-06-12)
- Goal: let users define predictable income/expense templates (rent, subscriptions,
  salary) once and post them in one click when due — Sprint A of
  `docs/features/recurring-transactions.md`.
- Shipped: `/dashboard/recurring` with Due & overdue / Upcoming / Inactive
  sections and summary cards (active count, due now, est. monthly base-currency
  expense); income/expense template create/edit form; lifecycle actions
  (activate/deactivate, hard-delete with inline confirm); one-click **Post**
  dialog (adjust date/amount/notes, plus an FX-rate field when the account
  currency ≠ base) that reuses the `create_manual_transaction` RPC, then advances
  `next_run_date` one frequency step and auto-deactivates once past `end_date`;
  sidebar + mobile-nav link (`Repeat` icon) and `nav.recurring` i18n (en/es).
  New: `app/dashboard/recurring/{page,actions,recurring-form,recurring-row,post-form,loading}.tsx`,
  `lib/recurring/shared.ts` (frequency options + UTC-safe `computeNextRunDate`
  with month-end clamping).
- Migrations added: `20260612162632_create_recurring_transactions.sql` — creates
  the `recurring_transactions` table, its index, `updated_at` trigger, and all
  four RLS policies (select member / insert+update+delete admin). The table was
  in the initial schema design doc but had **never been applied** to this
  project's database, so `db push` initially failed with "relation does not
  exist"; the migration was rewritten from delete-policy-only to full create.
- Tables changed: **new table** `recurring_transactions`.
- Follow-ups / known gaps: **Sprint B — auto-posting** (`auto_post` toggle +
  scheduled job + failure notification; blocked on multi-currency FX strategy)
  and **Sprint C — dashboard "Due soon" widget + recurring transfers** (needs a
  `to_account_id` column) are still pending. Posting is manual-only for now;
  income/expense only (the RPC rejects other types).

## Sprint 12.x — Category drag-and-drop, style picker, icon-only defaults (2026-06-12)
- Goal: bring the categories page up to the same polish as accounts —
  reorder by dragging, make picking a color/icon easy, and ensure system
  default categories ship with a sensible icon.
- Shipped: siblings-only drag-and-drop reorder (roots within a type, children
  within a parent) via `@dnd-kit` + `reorderCategoriesAction` bulk-writing
  `sort_order` (`categories/sortable-category-list.tsx`; `CategoryRow` gained
  an optional `dragHandle`); new `CategoryStylePicker` (curated color swatches
  + finance-emoji grid, plus a custom hex/emoji escape hatch) replacing the
  old free-text color/icon inputs (`lib/categories/style.ts`,
  `components/category-style-picker.tsx`); category icons now shown in every
  category dropdown (transaction category/subcategory picker, category form
  parent selector, transaction filters, budget line selector).
- Migrations added: `20260612144936_category_default_colors_icons.sql`
  (superseded in effect — see next) and `20260612180000_category_remove_default_colors.sql`.
  Net effect: `create_default_categories_for_household` now seeds system
  categories with a fitting **icon only** (color stays `null` — colored dots
  read as too saturated next to icons); existing system categories are
  backfilled the same way (icon filled if missing, any previously-seeded
  default color reverted to `null` unless the user changed it).
- Tables changed: none (schema already had `categories.color`/`icon`).
- Follow-ups / known gaps: re-parenting categories still happens via the edit
  form (DnD is siblings-only by design); archived view remains non-draggable.
- Dependency: reuses `@dnd-kit` (already added in the accounts sprint).

## Sprint 12.x — Account view toggle + drag-and-drop sorting (2026-06-12)
- Goal: Wealthsimple-style account presentation — choose list vs grouped view,
  and reorder accounts by dragging instead of a manual sort-order number.
- Shipped: List/Group(by account type) toggle with per-group subtotals across
  accounts, dashboard, and net-worth (remembered in cookie `af_accounts_view`,
  default group); drag-and-drop reordering on the accounts page via `@dnd-kit`
  (`reorderAccountsAction` bulk-writes `sort_order`); redundant account-type
  badge hidden in group view; new shared `BalanceAmount` component coloring
  balances green/red + minus sign (color-blind-aware, per [[feedback-user-colorblind]]).
  New: `lib/accounts-view/*`, `components/{accounts-view-toggle,account-group,balance-amount}`,
  `accounts/sortable-accounts-list`.
- Migrations added: none (`accounts.sort_order` already existed).
- Tables changed: none.
- Follow-ups / known gaps: debts page intentionally keeps its own "outstanding
  balance" styling (not BalanceAmount); DnD sorting is accounts-page only.
- Dependency added: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

## Sprint 12.x — Amount input & currency formatting fix (2026-06-12)
- Goal: fix raw/unformatted monetary values shown to the user (assistant draft
  card and budget line amount fields).
- Shipped: new shared `AmountInput` component (`src/components/amount-input.tsx`)
  with currency-symbol prefix and live thousands grouping; new `lib/format.ts`
  helpers (`getCurrencySymbol`, `formatAmountForDisplay`, `sanitizeAmountInput`);
  adopted across budget line, debt, opening balance, and transaction/transfer
  edit forms; AI assistant draft card now formats extracted amounts as currency
  (PR #8).
- Migrations added: none.
- Tables changed: none.
- Follow-ups / known gaps: exchange-rate, due-day, and sort-order inputs remain
  plain numerics by design (not money).
