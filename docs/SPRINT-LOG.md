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
