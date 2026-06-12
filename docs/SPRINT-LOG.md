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
