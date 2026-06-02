# Alpha Readiness Checklist

Use this checklist before starting Sprint 12 personal Alpha usage.

## Auth And Session

- [ ] Logged-out users are redirected away from private dashboard routes.
- [ ] Login succeeds for the test user.
- [ ] Invalid login shows a safe inline error.
- [ ] Sign out is visible or reachable on desktop, tablet, and mobile widths.
- [ ] Sign out returns the user to `/login`.

## Onboarding

- [ ] New user can create a household.
- [ ] Base currency selection works.
- [ ] Default categories are created.
- [ ] User lands on Dashboard after onboarding.

## MVP Modules

- [ ] Dashboard loads balances, monthly summary, and category expense cards.
- [ ] Accounts can be created, edited, archived, and unarchived.
- [ ] Categories can be created, edited, archived, and unarchived.
- [ ] Income and expense transactions can be created.
- [ ] Manual transactions can be edited and voided.
- [ ] Transfers can be created and edited.
- [ ] Budgets can be created, copied, edited, and reviewed by month.
- [ ] CSV import opens, maps columns, previews rows, and imports valid rows.
- [ ] CSV export downloads transactions, accounts, and categories.
- [ ] Debts can be created or linked to liabilities.
- [ ] Debt payments create the expected ledger movement.
- [ ] Net Worth loads included and excluded account totals.

## Responsive QA

- [ ] Navigation is usable around 1280px, 1024px, 768px, and 390px.
- [ ] Dashboard cards remain readable on mobile.
- [ ] Forms fit the viewport without horizontal scrolling.
- [ ] Lists, cards, and CSV preview tables do not break the viewport.
- [ ] Buttons remain visible and tappable after wrapping.

## Error, Empty, And Loading States

- [ ] Major modules show clear empty states on a fresh household.
- [ ] Expected validation errors are plain language.
- [ ] Supabase/Postgres/internal errors are not exposed in UI.
- [ ] Loading states appear during route transitions where applicable.

## Calculation Sanity

- [ ] Transfers do not inflate income or expenses.
- [ ] Voided transactions are excluded from calculations.
- [ ] Opening balances affect balances and net worth but not reports.
- [ ] Principal-only debt payments do not inflate expenses.
- [ ] Debt interest counts as expense when categorized as interest.
- [ ] `include_in_net_worth` changes net worth inclusion.
- [ ] `exclude_from_reports` changes dashboard/report inclusion.
- [ ] `exclude_from_budget` changes budget category availability.

## Deployment

- [ ] Vercel preview deploys successfully.
- [ ] Preview environment variables point to the intended Supabase project.
- [ ] Preview login, dashboard, import/export, debts, and net worth load.
- [ ] No console or server logs reveal secrets or raw database internals.
