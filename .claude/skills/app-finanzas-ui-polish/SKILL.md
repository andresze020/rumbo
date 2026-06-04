---
name: app-finanzas-ui-polish
description: Use when editing App Finanzas UI, forms, validation messages, responsive layout, shadcn components, filters, empty states, tables, cards, or mobile behavior.
---

# App Finanzas UI Polish

Use this skill for frontend/UI changes.

## UX principles

- Keep the app simple enough for a non-technical household user.
- Prefer clear flows over dense configuration.
- Registration of common transactions should feel fast.
- Use financial language consistently.
- Do not duplicate controls unless there is a strong UX reason.
- Show helpful empty states.
- Validation messages should tell the user how to fix the issue.
- Avoid exposing internal database/RLS errors to the user.

## UI rules

- Use existing component conventions.
- Prefer shadcn/ui patterns already present in the repo.
- Keep Tailwind classes readable.
- Preserve responsive behavior.
- Do not introduce new UI libraries without explicit approval.
- Use loading, error, empty, and success states where relevant.
- Keep forms keyboard-friendly and mobile-friendly.

## Form/action pattern (Sprint 12.6+)

**All create/edit/action forms must open in a `FormDialog`, never as inline Cards.**

- Component: `src/components/form-dialog.tsx` — generic wrapper, takes `title`, `description`, `cancelHref`, `children`, `wide?`.
- Trigger pattern: URL params (`?mode=create`, `?edit={id}`, `?pay={id}`). The server page detects the param and renders `<FormDialog>` conditionally. On close (Escape, X, outside click) `FormDialog` navigates to `cancelHref` via `useRouter.push`.
- Cancel links inside the form navigate to the clean URL — the page re-renders without the param and the dialog disappears naturally.
- After a successful server action redirect, same thing — param is gone, dialog is not rendered.
- Use `wide` prop for forms with 6+ fields (accounts, debts). Omit for smaller forms (payment, opening balance).
- For global/cross-page triggers that need data fetched lazily on open, use `GlobalAddTransactionButton` (`src/components/global-add-transaction-button.tsx`) as the pattern: client component + `useState(open)` + server action call **on every open** (not cached) to ensure newly created categories/accounts appear immediately.
- The FAB (bottom-right Plus button) is the sole global add-transaction entry point. Do not add add-transaction buttons to the navbar.
- If adding a new form to any page, follow this checklist:
  1. Add the URL param to the page's `searchParams` type.
  2. Detect it in the server component.
  3. Wrap the form in `<FormDialog>` with appropriate `cancelHref`.
  4. The trigger button/link simply sets the URL param (standard `<Link>`).

## Form rules

For financial forms:
- Validate dates.
- Validate amounts.
- Allow zero only when the business rule allows zero.
- Allow negative values only when the business rule allows negative values, such as liability opening balances if supported.
- Archived accounts/categories should be hidden by default in new transaction forms.
- Existing historical records may still display archived names.

## Transfer form FX support (Sprint 12.7+)

When a transfer is between accounts in non-base currency (e.g., both COP when base is CAD):
- Show an auto-fetch FX rate field: "1 CAD = ? COP"
- Use the same `fetchFxRate()` function and auto-fill pattern as income/expense forms
- Pass `exchange_rate_to_base` to the RPC (both `create_transfer_transaction` and `update_transfer_transaction` accept this parameter)
- Transfers within base-currency pass exchange_rate_to_base = 1 (default)

## Responsive QA

Check:
- Mobile width around 360px.
- Tablet width around 768px.
- Desktop width.
- Long account/category names.
- Empty lists.
- Error messages.
- Dialogs and dropdowns.
- Tables/cards with many rows.

## Final UI output

Include:
```text
UI changes:
- Components/pages touched:
- States covered:
- Responsive checks:
- Manual test steps:
```
