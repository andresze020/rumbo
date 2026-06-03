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

## Form rules

For financial forms:
- Validate dates.
- Validate amounts.
- Allow zero only when the business rule allows zero.
- Allow negative values only when the business rule allows negative values, such as liability opening balances if supported.
- Archived accounts/categories should be hidden by default in new transaction forms.
- Existing historical records may still display archived names.

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
