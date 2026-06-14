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
