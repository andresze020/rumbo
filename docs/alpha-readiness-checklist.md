# Alpha Readiness Checklist

Use this checklist before starting Sprint 12 personal Alpha usage.

## Auth / Session

- [X] Logged-out users are redirected away from dashboard routes.
- [X] Valid login reaches the dashboard.
- [X] Invalid login shows a safe inline error.
- [X] Sign out is reachable on desktop, tablet, and mobile.
- [X] Sign out returns the user to `/login`.

## Onboarding

- [X] New user can create a household.
- [X] Base currency selection works.
- [X] Default household setup completes.
- [X] User lands on Dashboard after onboarding.

## Accounts

- [X] Accounts page is readable at 1280px, 1024px, 768px, 430px, and 390px.
- [X] Create/edit forms open only through actions.
- [-] Create, edit, archive, restore, and opening balance flows still work.
- [X] `include_in_net_worth` affects net worth inclusion.
- [X] Empty active and archived states are clear.

## Categories

- [X] Categories page is readable at desktop, tablet, and mobile widths.
- [X] Category/subcategory hierarchy is easy to scan.
- [X] Create/edit forms open only through actions.
- [X] Archive/restore still works.
- [ ] `exclude_from_budget` and `exclude_from_reports` behavior still works.

## Transactions / Transfers

- [X] Transactions page is readable at desktop, tablet, and mobile widths.
- [X] Add/edit forms open only through actions.
- [X] Filters work for month, type, status, account, category, and search.
- [X] Income, expense, and transfer creation still works.
- [X] Manual transaction edit remains ledger-safe.
- [X] Void with optional reason still works.
- [X] Transfer rows show account flow clearly.
- [X] Opening balances are labeled without implying income or expense.
- [X] CSV-imported transactions show imported/source context.

## Dashboard

- [X] Dashboard cards remain readable on mobile.
- [X] Month selector wraps without horizontal overflow.
- [X] Expenses by category loads and respects excluded report categories.
- [X] Empty monthly activity state is clear.

## Budgets

- [X] Budget month selector wraps without horizontal overflow.
- [-] Create budget, copy previous month, add line, save line, and remove line still work.
- [X] Budget actuals calculate from posted expense transactions.
- [X] Categories excluded from budget are not offered for new lines.
- [X] Empty budget and empty line states are clear.

## CSV Import

- [X] Import page fits mobile width.
- [X] CSV upload rejects invalid files with plain-language errors.
- [X] Mapping and preview remain usable.
- [X] Preview table scrolls horizontally instead of breaking the viewport.
- [X] Import submit disables while processing.

## CSV Export

- [X] Export page fits mobile width.
- [X] Accounts, categories, and transactions CSV downloads work.
- [X] Export buttons disable while a download is being prepared.
- [X] Failed export shows a safe plain-language error.

## Debts

- [X] Debts page is readable at desktop, tablet, and mobile widths.
- [-] Create debt, edit debt, and register payment still work.
- [-] Debt payments do not inflate expenses unless interest is categorized as expense.
- [-] Empty debt state is clear.

## Net Worth

- [ ] Net Worth page is readable on mobile.
- [ ] Month selector wraps without horizontal overflow.
- [ ] Included/excluded account lists are clear.
- [ ] Liability balances are displayed as positive debt amounts.
- [ ] Empty asset/liability/excluded states are clear.

## Responsive Navigation

- [X] Dashboard navigation works at 1280px, 1024px, 768px, 430px, and 390px.
- [X] Mobile menu includes Dashboard, Accounts, Categories, Transactions, Import CSV, Export, Budgets, Debts, Net Worth, and Sign out.
- [X] Navigation does not create horizontal overflow.
- [X] Header buttons wrap cleanly on mobile.

## Error / Loading / Empty States

- [X] User-facing errors are safe and non-technical.
- [X] Server-action buttons show pending states for key create/edit/void/import/sign-out flows.
- [X] Route loading states exist for dashboard MVP pages.
- [X] Major empty states are short and helpful.

## Financial Calculation Sanity

- [X] Transfers do not inflate income or expenses.
- [X] Voided transactions are excluded from balances, dashboard, and budget calculations.
- [X] Opening balances affect balances/net worth but not reports.
- [-] Principal-only debt payments do not inflate expenses.
- [-] Debt interest counts as expense when categorized as interest.
- [-] Account balances remain consistent with ledger entries.

## Vercel Deployment Sanity

- [X] Preview deploy completes successfully.
- [?] Environment variables point to the intended Supabase project.
- [X] Login, dashboard, accounts, categories, transactions, import, export, budgets, debts, and net worth load on preview.
- [X] Logs do not expose secrets or raw database internals.

## Known Issues / Notes Before Sprint 12

- [X] Record any Alpha-only limitations before personal usage starts.
- [X] Confirm whether Sprint 11 should be tagged as `v0.11.0-export-security-polish` after merge to `main`.
