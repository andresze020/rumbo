---
name: app-finanzas-alpha-qa
description: Use when reviewing alpha readiness, creating QA checklists, testing a sprint, validating responsive UI, or preparing the app for a friend/family beta user.
---

# App Finanzas Alpha QA

Use this skill for alpha readiness, QA, smoke tests, and manual test plans.

## QA objective

The MVP Alpha should be usable for real personal/family finance tracking for at least one month without returning to AndroMoney or spreadsheets for analysis.

## Core smoke test

1. Sign up / login.
2. Create or access household.
3. Create asset account.
4. Create liability account.
5. Create income category.
6. Create expense category.
7. Add income.
8. Add expense.
9. Add transfer.
10. Add credit card purchase.
11. Add debt payment.
12. Check account balances.
13. Check dashboard totals.
14. Check net worth.
15. Create budget.
16. Compare budget vs actual.
17. Import CSV.
18. Export transactions.
19. Void/delete transaction according to current convention.
20. Verify archived accounts/categories do not appear by default in new forms.

## Financial correctness tests

- Transfers must not inflate income or expenses.
- Credit card spending must count as expense once.
- Credit card principal payment must not count as operational expense.
- Liability signs must display consistently.
- Total assets must not convert negative liabilities into positive assets.
- Net worth = assets - liabilities.
- Voided/deleted records must be excluded.
- CSV imports must preserve source/import batch traceability.

## UX tests

- Transaction entry should be fast and clear.
- Forms must show clear validation errors.
- Required fields must match business rules.
- Mobile width must not break tables/cards/forms.
- Avoid redundant filters/actions.
- Empty states should explain what to do next.
- Error messages should not expose sensitive details.

## Final QA output

Use this format:

```text
QA Summary
- Passed:
- Failed:
- Doubts:
- Untested:
- Bugs found:
- Recommended next sprint/fix:
```
